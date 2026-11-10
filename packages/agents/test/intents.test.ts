import { describe, expect, it } from 'vitest';
import { createIntentsClient, IntentsError, USDC_NEAR, WNEAR } from '../src/intents';

const okBody = {
  correlationId: 'c-1',
  timestamp: '2026-11-07T10:00:00Z',
  quote: {
    amountIn: '18133424218243195248646512',
    amountInFormatted: '18.1334',
    amountInUsd: '67.45',
    amountOut: '66660000',
    amountOutFormatted: '66.66',
    amountOutUsd: '66.64',
    timeEstimate: 10,
  },
};

describe('NEAR Intents dry quote (D-6.2)', () => {
  it('sends a dry EXACT_OUTPUT wNEAR → USDC request and labels the result', async () => {
    let sent: Record<string, unknown> = {};
    let headers: Record<string, string> = {};
    const client = createIntentsClient({
      apiKey: 'k',
      fetchImpl: (async (_url: string, init: RequestInit) => {
        sent = JSON.parse(String(init.body));
        headers = init.headers as Record<string, string>;
        return new Response(JSON.stringify(okBody), { status: 201 });
      }) as unknown as typeof fetch,
    });
    const q = await client.dryQuote('66660000');
    expect(sent).toMatchObject({
      dry: true,
      swapType: 'EXACT_OUTPUT',
      originAsset: WNEAR,
      destinationAsset: USDC_NEAR,
      amount: '66660000',
    });
    expect(headers['X-API-Key']).toBe('k');
    expect(q.dry).toBe(true);
    expect(q.label).toMatch(/Dry quote/);
    expect(q.pay_amount_formatted).toBe('18.1334');
    expect(q.receive_amount).toBe('66660000');
  });

  it('fails with IntentsError on HTTP errors, bad shapes and bad amounts', async () => {
    const http = createIntentsClient({
      fetchImpl: (async () => new Response('no', { status: 500 })) as unknown as typeof fetch,
    });
    await expect(http.dryQuote('1')).rejects.toThrow(IntentsError);
    const shape = createIntentsClient({
      fetchImpl: (async () => new Response('{"x":1}', { status: 200 })) as unknown as typeof fetch,
    });
    await expect(shape.dryQuote('1')).rejects.toThrow(/unexpected/);
    await expect(shape.dryQuote('1.5')).rejects.toThrow(/positive integer/);
  });
});
