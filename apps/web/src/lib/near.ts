import { JsonRpcProvider } from "near-api-js";
import { config } from "./config";

/**
 * Read-only chain access. Every balance, approval and policy the UI shows comes through here,
 * straight from RPC. The web app never asserts chain state itself (PRD §6.1).
 */
let provider: JsonRpcProvider | null = null;
export function rpc(): JsonRpcProvider {
  provider ??= new JsonRpcProvider({ url: config.rpcUrl });
  return provider;
}

/** Calls a view method and returns its JSON result. Throws with the RPC/contract message on failure. */
export async function view<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await rpc().callFunction<T & {}>({ contractId, method, args, blockQuery: { finality: "final" } });
  return res as T;
}

/**
 * Re-reads a view until `done(result)` is true or the timeout passes. Used after transactions
 * instead of optimistic updates, so the chain stays the source of truth (P-1.2).
 */
export async function pollView<T>(read: () => Promise<T>, done: (v: T) => boolean, { timeoutMs = 10_000, everyMs = 1_000 } = {}): Promise<T> {
  const until = Date.now() + timeoutMs;
  let last = await read();
  while (!done(last) && Date.now() < until) {
    await new Promise((r) => setTimeout(r, everyMs));
    last = await read();
  }
  return last;
}

// ── Typed views (shapes follow PRD §10.1 / §11.1; adjust once Isaac's contract lands, in this file only) ──

export type U128 = string;

export interface StorageBalance {
  total: U128;
  available: U128;
}

export const ft = {
  balanceOf: (token: string, accountId: string) => view<U128>(token, "ft_balance_of", { account_id: accountId }),
  storageBalanceOf: (token: string, accountId: string) => view<StorageBalance | null>(token, "storage_balance_of", { account_id: accountId }),
  metadata: (token: string) => view<{ symbol: string; decimals: number; name: string }>(token, "ft_metadata"),
};

export interface OwnerTokenState {
  available: U128;
  reserved: U128;
  withdrawing: U128;
}

export interface OwnerState {
  balances: Record<string, OwnerTokenState>;
  agents: string[];
  effective_limits: { max_basket_total: U128; daily_cap: U128 };
  spent_today: U128;
  remaining_today: U128;
}

export interface VaultStatus {
  paused: boolean;
  deficit: boolean;
  policy_version: number;
}

export const vault = {
  ownerState: (ownerId: string) => view<OwnerState>(config.vaultId, "get_owner_state", { owner_id: ownerId }),
  status: () => view<VaultStatus>(config.vaultId, "get_status"),
  policy: () => view<Record<string, unknown>>(config.vaultId, "get_policy"),
  approval: (hashHex: string) => view<{ owner: string; expires_at_ms: string } | null>(config.vaultId, "get_approval", { hash_hex: hashHex }),
  basket: (hashHex: string) => view<Record<string, unknown> | null>(config.vaultId, "get_basket", { hash_hex: hashHex }),
  baskets: (ownerId: string, fromIndex = 0, limit = 20) =>
    view<Record<string, unknown>[]>(config.vaultId, "get_baskets", { owner_id: ownerId, from_index: fromIndex, limit }),
};
