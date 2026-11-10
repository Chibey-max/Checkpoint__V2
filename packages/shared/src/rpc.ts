/**
 * Minimal NEAR JSON-RPC client for view calls. Works in Node and the browser
 * (fetch only), so Guard, the agents, verify:audit and the web app share it.
 */
import { toBase64 } from './encoding';

export class RpcError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'rpc' | 'contract' | 'parse',
  ) {
    super(message);
    this.name = 'RpcError';
  }
}

export interface ViewOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Extra attempts after a network failure (unreachable, timeout, non-2xx HTTP). Default 1. */
  retries?: number;
}

/** Call a view method and JSON-parse its result. Throws RpcError on any failure. */
export async function viewFunction<T = unknown>(
  rpcUrl: string,
  contractId: string,
  methodName: string,
  args: Record<string, unknown> = {},
  opts: ViewOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 1;
  for (let attempt = 0; ; attempt++) {
    try {
      return await viewOnce<T>(rpcUrl, contractId, methodName, args, opts);
    } catch (e) {
      // Only transient network failures are retried; contract and RPC errors are final.
      if (!(e instanceof RpcError) || e.kind !== 'network' || attempt >= retries) throw e;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
}

async function viewOnce<T>(
  rpcUrl: string,
  contractId: string,
  methodName: string,
  args: Record<string, unknown>,
  opts: ViewOptions,
): Promise<T> {
  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'checkpoint',
        method: 'query',
        params: {
          request_type: 'call_function',
          finality: 'final',
          account_id: contractId,
          method_name: methodName,
          args_base64: toBase64(new TextEncoder().encode(JSON.stringify(args))),
        },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000),
    });
  } catch (e) {
    throw new RpcError(`RPC unreachable: ${(e as Error).message}`, 'network');
  }
  if (!res.ok) throw new RpcError(`RPC HTTP ${res.status}`, 'network');
  let body: { error?: unknown; result?: { result?: number[]; error?: string } };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new RpcError('RPC returned invalid JSON', 'parse');
  }
  if (body.error) throw new RpcError(`RPC error: ${JSON.stringify(body.error)}`, 'rpc');
  if (body.result?.error) throw new RpcError(`contract error: ${body.result.error}`, 'contract');
  const bytes = body.result?.result;
  if (!Array.isArray(bytes)) throw new RpcError('RPC result missing', 'parse');
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes))) as T;
  } catch {
    throw new RpcError(`view ${methodName} did not return JSON`, 'parse');
  }
}

/** NFR-02: testnet or sandbox only. */
export function assertNotMainnet(network: string, rpcUrl?: string): void {
  if (!['testnet', 'sandbox'].includes(network)) {
    throw new Error(
      `NEAR_NETWORK must be testnet or sandbox (got "${network}"); mainnet writes are not allowed`,
    );
  }
  if (rpcUrl && /mainnet/i.test(rpcUrl)) {
    throw new Error('NEAR_RPC_URL points at mainnet; only testnet or sandbox is allowed');
  }
}
