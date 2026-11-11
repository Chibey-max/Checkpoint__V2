import { getConnInfo } from '@hono/node-server/conninfo';
import {
  AssessRequestSchema,
  SignBasketRequestSchema,
  type CorsOrigin,
  type GuardError,
} from '@checkpoint/shared';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { requestId, type RequestIdVariables } from 'hono/request-id';
import { silentLogger, type Logger } from './logger';
import { rateLimit } from './rate-limit';
import { GuardHttpError, type GuardService } from './service';

const PRICE_KEY_RE = /(price|amount|total|fee|cost|usd)/i;

/** FR-R02: callers send offer IDs only. Any price-like key anywhere in the body is rejected. */
export function findPriceKeys(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => findPriceKeys(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [
      ...(PRICE_KEY_RE.test(k) ? [`${path}${path ? '.' : ''}${k}`] : []),
      ...findPriceKeys(v, `${path}${path ? '.' : ''}${k}`),
    ]);
  }
  return [];
}

function clientKey(c: Context): string {
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

async function readBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new GuardHttpError(400, 'BAD_REQUEST', 'body must be JSON');
  }
}

export interface GuardAppOptions {
  logger?: Logger;
  /** false disables rate limiting (tests). Default 30 requests/minute/IP (FR-R09). */
  rateLimit?: { limit: number; windowMs: number } | false;
  corsOrigin?: CorsOrigin;
}

export function createGuardApp(service: GuardService, opts: GuardAppOptions = {}) {
  const log = opts.logger ?? silentLogger;
  const app = new Hono<{ Variables: RequestIdVariables }>();

  app.use('*', requestId());
  app.use('*', async (c, next) => {
    const t = Date.now();
    await next();
    log.info('request', {
      request_id: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - t,
    });
  });
  if (opts.corsOrigin) app.use('/v1/*', cors({ origin: opts.corsOrigin }));
  if (opts.rateLimit !== false) {
    const rl = opts.rateLimit ?? { limit: 30, windowMs: 60_000 };
    app.use('/v1/*', rateLimit({ ...rl, key: clientKey }));
  }

  app.get('/v1/health', async (c) => {
    const h = await service.health();
    return c.json(h, h.ok ? 200 : 503);
  });

  app.get('/v1/policy', (c) => c.json(service.policyInfo()));

  app.post('/v1/assess', async (c) => {
    const body = await readBody(c);
    const priceKeys = findPriceKeys(body);
    if (priceKeys.length)
      throw new GuardHttpError(
        400,
        'PRICE_FIELD_REJECTED',
        `Send offer IDs only; Guard loads prices itself. Rejected: ${priceKeys.join(', ')}`,
      );
    const parsed = AssessRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new GuardHttpError(
        400,
        'BAD_REQUEST',
        'invalid request',
        undefined,
        parsed.error.issues,
      );
    return c.json(await service.assess(parsed.data));
  });

  app.post('/v1/sign-basket', async (c) => {
    const body = await readBody(c);
    const priceKeys = findPriceKeys(body);
    if (priceKeys.length)
      throw new GuardHttpError(
        400,
        'PRICE_FIELD_REJECTED',
        `Guard rebuilds every amount from offer IDs. Rejected: ${priceKeys.join(', ')}`,
      );
    const parsed = SignBasketRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new GuardHttpError(
        400,
        'BAD_REQUEST',
        'invalid request',
        undefined,
        parsed.error.issues,
      );
    return c.json(await service.signBasket(parsed.data));
  });

  app.notFound((c) =>
    c.json(
      {
        code: 'NOT_FOUND',
        message: `${c.req.method} ${c.req.path} not found`,
      } satisfies GuardError,
      404,
    ),
  );

  app.onError((err, c) => {
    if (err instanceof GuardHttpError) {
      const body: GuardError = { code: err.code, message: err.message };
      if (err.findings) body.findings = err.findings;
      if (err.details !== undefined) body.details = err.details;
      return c.json(body, err.status);
    }
    log.error('unhandled error', { request_id: c.get('requestId'), error: err.message });
    return c.json({ code: 'INTERNAL', message: 'internal error' } satisfies GuardError, 500);
  });

  return app;
}
