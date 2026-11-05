import { loadSnapshotOrThrow } from '@checkpoint/shared/node';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GroqLlm, isStrictCompatible, LlmError, toResponseSchema } from '../src/llm';
import { buildMock } from '../src/mock/build';
import { parseDeterministic } from '../src/parser/deterministic';
import { llmParseSchema, parseWithLlm } from '../src/parser/llm';

const SNAP = loadSnapshotOrThrow(
  new URL('../../../data/fixtures/dev-snapshot', import.meta.url).pathname,
);
const DEMO =
  '2× VPS 2 vCPU/4 GB for 1 month, 1× .com domain for 1 year, 1 TB object storage for 1 month';

/** A fake Groq endpoint: records each request body and replies with `reply`. */
function fakeGroq(reply: { status?: number; content?: string | null; finish_reason?: string }) {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const status = reply.status ?? 200;
    const body =
      status === 200
        ? {
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: 0,
            model: 'openai/gpt-oss-120b',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: reply.content ?? null },
                finish_reason: reply.finish_reason ?? 'stop',
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }
        : { error: { message: 'bad request', type: 'invalid_request_error' } };
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const llm = new GroqLlm({
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    apiKey: 'gsk_test',
    fetch: fetchImpl,
  });
  return { llm, bodies };
}

const DEMO_ITEMS = {
  items: [
    { item_key: 'vps-2c4g-month', qty: 2 },
    { item_key: 'domain-com-year', qty: 1 },
    { item_key: 'storage-1tb-month', qty: 1 },
  ],
  unmatched: [],
};

describe('Groq client', () => {
  it('sends a strict JSON schema built from the Zod schema, at low reasoning effort', async () => {
    const { llm, bodies } = fakeGroq({ content: JSON.stringify(DEMO_ITEMS) });
    await parseWithLlm(llm, DEMO, SNAP.catalog);
    const body = bodies[0]!;
    expect(body.model).toBe('openai/gpt-oss-120b');
    expect(body.reasoning_effort).toBe('low');
    const rf = body.response_format as {
      type: string;
      json_schema: { name: string; strict: boolean; schema: Record<string, unknown> };
    };
    expect(rf.type).toBe('json_schema');
    expect(rf.json_schema.name).toBe('parsed_list');
    expect(rf.json_schema.strict).toBe(true);
    expect(rf.json_schema.schema).not.toHaveProperty('$schema');
    expect(JSON.stringify(rf.json_schema.schema)).toContain('"enum":["vps-2c4g-month"');
    const messages = body.messages as { role: string; content: string }[];
    expect(messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(messages[1]!.content).toContain('<request>');
  });

  it('gives the same items as the deterministic parser for the demo list (D-3.1)', async () => {
    const { llm } = fakeGroq({ content: JSON.stringify(DEMO_ITEMS) });
    expect(await parseWithLlm(llm, DEMO, SNAP.catalog)).toEqual(
      parseDeterministic(DEMO, SNAP.catalog),
    );
  });

  it.each([
    [
      'an item outside the catalogue',
      { content: JSON.stringify({ items: [{ item_key: 'gpu', qty: 1 }], unmatched: [] }) },
      'unparsed',
    ],
    [
      'a quantity out of range',
      {
        content: JSON.stringify({
          items: [{ item_key: 'vps-2c4g-month', qty: 99 }],
          unmatched: [],
        }),
      },
      'unparsed',
    ],
    ['non-JSON output', { content: 'sure! here you go' }, 'unparsed'],
    ['truncated output', { content: '{"items":[', finish_reason: 'length' }, 'unparsed'],
    ['empty output', { content: null }, 'unparsed'],
    ['an API error', { status: 400 }, 'api'],
  ] as const)('rejects %s with LlmError(%s)', async (_name, reply, kind) => {
    const { llm } = fakeGroq(reply);
    const err = await parseWithLlm(llm, DEMO, SNAP.catalog).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).kind).toBe(kind);
  });

  it('only sends reasoning_effort to gpt-oss models', async () => {
    const bodies: Record<string, unknown>[] = [];
    const llm = new GroqLlm({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      apiKey: 'gsk_test',
      fetch: (async (_u: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(
          JSON.stringify({
            id: 'x',
            object: 'chat.completion',
            created: 0,
            model: 'm',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: '{"ok":true}' },
                finish_reason: 'stop',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }) as typeof fetch,
    });
    await llm.structured({ system: 's', user: 'u', schema: z.strictObject({ ok: z.boolean() }) });
    expect(bodies[0]).not.toHaveProperty('reasoning_effort');
  });

  it('strict mode is only requested when the schema allows it', () => {
    expect(isStrictCompatible(toResponseSchema(llmParseSchema(SNAP.catalog)))).toBe(true);
    expect(isStrictCompatible(toResponseSchema(z.object({ a: z.string().optional() })))).toBe(
      false,
    );
  });
});

describe('pipeline with Groq failing', () => {
  it('falls back to the deterministic parser and keeps going (recoverable error)', async () => {
    const { llm } = fakeGroq({ status: 400 });
    const m = buildMock({
      llm,
      autoApproveMs: 10,
      settleMs: 0,
      researchDelayMs: 0,
      approvalPollMs: 5,
      settlementPollMs: 5,
      assessNowMs: Date.parse('2026-11-06T00:00:00Z'),
    });
    const id = m.orch.createRequest({ owner_id: 'owner-demo.cpdemo.testnet', text: DEMO });
    await m.orch.whenIdle(id);
    const view = m.orch.view(id);
    expect(view.parser).toBe('deterministic');
    expect(view.errors.map((e) => [e.code, e.recoverable])).toEqual(
      expect.arrayContaining([
        ['LLM_PARSE_FAILED', true],
        ['LLM_EXPLAIN_FAILED', true],
      ]),
    );
    expect(view.state).toBe('final');
    expect(Object.values(view.explanations.verdicts).every((e) => e.source === 'template')).toBe(
      true,
    );
  });
});
