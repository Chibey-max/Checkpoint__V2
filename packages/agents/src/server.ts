import {
  AcknowledgeRequestSchema,
  AccountIdSchema,
  CreateRequestSchema,
  type AgentEvent,
  type CorsOrigin,
} from '@checkpoint/shared';
import { silentLogger, type Logger } from '@checkpoint/guard';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { requestId, type RequestIdVariables } from 'hono/request-id';
import { streamSSE } from 'hono/streaming';
import { IntentsError, type IntentsClient } from './intents';
import { HttpError, type Orchestrator } from './orchestrator';

export interface AgentsAppOptions {
  logger?: Logger;
  corsOrigin?: CorsOrigin;
  /** Extra routes (the mock server mounts /v1/dev/* here). */
  extend?: (app: Hono<{ Variables: RequestIdVariables }>) => void;
  keepAliveMs?: number;
  /** NEAR Intents dry quotes (D-6.2). Without it, /intents-quote answers 501. */
  intents?: IntentsClient;
}

async function body(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', 'body must be JSON');
  }
}

export function createAgentsApp(orch: Orchestrator, opts: AgentsAppOptions = {}) {
  const log = opts.logger ?? silentLogger;
  const app = new Hono<{ Variables: RequestIdVariables }>();
  app.use('*', requestId());
  if (opts.corsOrigin)
    app.use('/v1/*', cors({ origin: opts.corsOrigin, exposeHeaders: ['content-type'] }));

  app.get('/v1/health', (c) => c.json({ ok: true }));

  app.get('/v1/catalog', (c) => c.json({ items: orch.catalog }));

  app.post('/v1/requests', async (c) => {
    const parsed = CreateRequestSchema.safeParse(await body(c));
    if (!parsed.success)
      return c.json(
        { code: 'BAD_REQUEST', message: 'invalid request', details: parsed.error.issues },
        400,
      );
    const request_id = orch.createRequest(parsed.data);
    log.info('request created', { request_id, owner_id: parsed.data.owner_id });
    return c.json({ request_id }, 201);
  });

  // Added for the Desk history list (P-2.1); not in PRD §11.5.
  app.get('/v1/requests', (c) => {
    const owner = AccountIdSchema.safeParse(c.req.query('owner_id'));
    if (!owner.success)
      return c.json({ code: 'BAD_REQUEST', message: 'owner_id query parameter is required' }, 400);
    return c.json({ requests: orch.list(owner.data) });
  });

  app.get('/v1/requests/:id', (c) => c.json(orch.view(c.req.param('id'))));

  app.get('/v1/requests/:id/events', (c) => {
    const id = c.req.param('id');
    const lastHeader = c.req.header('last-event-id') ?? c.req.query('after') ?? '0';
    const after = /^\d+$/.test(lastHeader) ? Number.parseInt(lastHeader, 10) : 0;
    orch.events(id, 0); // 404 before opening the stream
    return streamSSE(c, async (stream) => {
      let last = after;
      let closed = false;
      const queue: AgentEvent[] = [];
      let wake: (() => void) | null = null;
      // Subscribe first, then replay, so nothing emitted in between is lost; seq dedupes.
      const unsubscribe = orch.subscribe(id, (e) => {
        queue.push(e);
        wake?.();
      });
      const ping = setInterval(() => {
        void stream.write(': ping\n\n');
      }, opts.keepAliveMs ?? 15_000);
      stream.onAbort(() => {
        closed = true;
        clearInterval(ping);
        unsubscribe();
        wake?.();
      });
      const send = async (e: AgentEvent) => {
        if (e.seq <= last) return;
        last = e.seq;
        await stream.writeSSE({ id: String(e.seq), event: e.type, data: JSON.stringify(e) });
      };
      for (const e of orch.events(id, after)) await send(e);
      while (!closed) {
        while (queue.length) await send(queue.shift()!);
        if (closed) break;
        await new Promise<void>((r) => {
          wake = r;
          if (queue.length) r();
        });
        wake = null;
      }
    });
  });

  app.post('/v1/requests/:id/acknowledge', async (c) => {
    const parsed = AcknowledgeRequestSchema.safeParse(await body(c));
    if (!parsed.success)
      return c.json(
        { code: 'BAD_REQUEST', message: 'invalid request', details: parsed.error.issues },
        400,
      );
    orch.acknowledge(c.req.param('id'), parsed.data.offer_ids);
    return c.json({ ok: true }, 202);
  });

  app.post('/v1/requests/:id/cancel', (c) => {
    orch.cancel(c.req.param('id'));
    return c.json({ ok: true });
  });

  // D-6.2 (P2): a labelled, display-only dry quote for paying the basket through NEAR Intents.
  app.get('/v1/requests/:id/intents-quote', async (c) => {
    if (!opts.intents)
      return c.json(
        { code: 'NOT_ENABLED', message: 'Intents quotes are off (AGENTS_INTENTS=off)' },
        501,
      );
    const view = orch.view(c.req.param('id'));
    const total = view.basket?.total;
    if (!total)
      return c.json({ code: 'NO_BASKET', message: 'this request has no basket yet' }, 409);
    try {
      return c.json({ basket_total: total, quote: await opts.intents.dryQuote(total) });
    } catch (e) {
      if (e instanceof IntentsError)
        return c.json({ code: 'INTENTS_UNAVAILABLE', message: e.message }, 503);
      throw e;
    }
  });

  app.get('/v1/audit/:basket_id', (c) => c.json(orch.audit(c.req.param('basket_id'))));

  opts.extend?.(app);

  app.notFound((c) =>
    c.json({ code: 'NOT_FOUND', message: `${c.req.method} ${c.req.path} not found` }, 404),
  );
  app.onError((err, c) => {
    if (err instanceof HttpError)
      return c.json({ code: err.code, message: err.message }, err.status);
    log.error('unhandled error', { request_id: c.get('requestId'), error: err.message });
    return c.json({ code: 'INTERNAL', message: 'internal error' }, 500);
  });
  return app;
}
