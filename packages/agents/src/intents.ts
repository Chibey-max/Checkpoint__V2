/**
 * NEAR Intents 1Click dry quote (task D-6.2, P2, FR-AG13).
 *
 * "What would this basket cost if paid from wNEAR through NEAR Intents?" The
 * agents ask 1Click (mainnet) for a *dry* EXACT_OUTPUT quote: deliver the
 * basket total as USDC on NEAR, paid from wNEAR. Dry means no deposit address
 * is created and nothing can move. It is display-only, never signed, never
 * used by Guard or the Vault, and labelled as such.
 *
 * Checked on 7 Nov 2026: POST /v0/quote with dry=true answers without an API
 * key. ONECLICK_API_KEY is sent as X-API-Key when set.
 */
import { z } from 'zod';

export const ONECLICK_URL = 'https://1click.chaindefuser.com';
export const WNEAR = 'nep141:wrap.near';
/** Native USDC on NEAR (6 decimals). */
export const USDC_NEAR = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
/** A well-formed placeholder (NEAR implicit account of zeros): dry quotes need one but never use it. */
const PLACEHOLDER_ACCOUNT = '0'.repeat(64);

const QuoteResponseSchema = z.object({
  quote: z.object({
    amountIn: z.string(),
    amountInFormatted: z.string(),
    amountInUsd: z.string(),
    amountOut: z.string(),
    amountOutFormatted: z.string(),
    amountOutUsd: z.string(),
    timeEstimate: z.number(),
  }),
  timestamp: z.string().optional(),
  correlationId: z.string().optional(),
});

export interface IntentsQuote {
  label: string;
  dry: true;
  network: 'mainnet';
  pay_asset: string;
  pay_amount: string;
  pay_amount_formatted: string;
  pay_usd: string;
  receive_asset: string;
  receive_amount: string;
  receive_amount_formatted: string;
  time_estimate_s: number;
  quoted_at: string;
  correlation_id: string | null;
}

export interface IntentsClient {
  dryQuote(usdcBaseUnits: string): Promise<IntentsQuote>;
}

export class IntentsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntentsError';
  }
}

export function createIntentsClient(
  opts: { baseUrl?: string; apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): IntentsClient {
  const base = (opts.baseUrl ?? ONECLICK_URL).replace(/\/$/, '');
  const f = opts.fetchImpl ?? fetch;
  return {
    async dryQuote(amount) {
      if (!/^[1-9]\d*$/.test(amount))
        throw new IntentsError('amount must be a positive integer string');
      const body = {
        dry: true,
        swapType: 'EXACT_OUTPUT',
        slippageTolerance: 100,
        originAsset: WNEAR,
        depositType: 'INTENTS',
        destinationAsset: USDC_NEAR,
        amount,
        refundTo: PLACEHOLDER_ACCOUNT,
        refundType: 'INTENTS',
        recipient: PLACEHOLDER_ACCOUNT,
        recipientType: 'INTENTS',
        deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
      };
      let res: Response;
      try {
        res = await f(`${base}/v0/quote`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(opts.apiKey ? { 'X-API-Key': opts.apiKey } : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000),
        });
      } catch (e) {
        throw new IntentsError(`1Click unreachable: ${(e as Error).message}`);
      }
      if (!res.ok) throw new IntentsError(`1Click answered HTTP ${res.status}`);
      const parsed = QuoteResponseSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new IntentsError('1Click returned an unexpected quote shape');
      const q = parsed.data.quote;
      return {
        label:
          'Dry quote from NEAR Intents 1Click (mainnet). Illustrative only: nothing is signed or moved.',
        dry: true,
        network: 'mainnet',
        pay_asset: WNEAR,
        pay_amount: q.amountIn,
        pay_amount_formatted: q.amountInFormatted,
        pay_usd: q.amountInUsd,
        receive_asset: USDC_NEAR,
        receive_amount: q.amountOut,
        receive_amount_formatted: q.amountOutFormatted,
        time_estimate_s: q.timeEstimate,
        quoted_at: parsed.data.timestamp ?? new Date().toISOString(),
        correlation_id: parsed.data.correlationId ?? null,
      };
    },
  };
}
