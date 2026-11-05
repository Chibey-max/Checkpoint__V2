import type { ConnectorAction } from "@hot-labs/near-connect";
import { config } from "./config";
import { ONE_YOCTO, TGAS } from "./format";
import { view, type StorageBalance } from "./near";

/**
 * Every contract call the web app makes goes through these builders, so a method rename in the
 * Vault, token or DAO is a one-file change (P-1.1). Builders return a transaction description;
 * `useWallet().send(tx)` signs and sends it.
 */
export interface Tx {
  receiverId: string;
  actions: ConnectorAction[];
  /** Short label for wallet prompts, toasts and logs. */
  label: string;
}

function call(receiverId: string, methodName: string, args: object, deposit: bigint, gasT: bigint, label: string): Tx {
  return {
    receiverId,
    label,
    actions: [{ type: "FunctionCall", params: { methodName, args, gas: (gasT * TGAS).toString(), deposit: deposit.toString() } }],
  };
}

// ── cpUSD (NEP-141 / NEP-145) ──

/** Minimum storage deposit for registering on a token. Read from the contract, never hard-coded. */
export async function storageMin(token = config.tokenId): Promise<bigint> {
  const b = await view<{ min: string }>(token, "storage_balance_bounds");
  return BigInt(b.min);
}

export const isRegistered = async (accountId: string, token = config.tokenId) =>
  (await view<StorageBalance | null>(token, "storage_balance_of", { account_id: accountId })) !== null;

export const storageDeposit = (accountId: string, minDeposit: bigint, token = config.tokenId) =>
  call(token, "storage_deposit", { account_id: accountId, registration_only: true }, minDeposit, 30n, "Register on cpUSD");

/** Deposit into the Vault: ft_transfer_call to the Vault with an empty msg (FR-V, PRD §11.1 ft_on_transfer). */
export const deposit = (amount: bigint, token = config.tokenId) =>
  call(token, "ft_transfer_call", { receiver_id: config.vaultId, amount: amount.toString(), msg: "" }, ONE_YOCTO, 100n, "Deposit to Vault");

export const ftTransfer = (receiverId: string, amount: bigint, memo?: string, token = config.tokenId) =>
  call(token, "ft_transfer", { receiver_id: receiverId, amount: amount.toString(), memo }, ONE_YOCTO, 30n, "Transfer cpUSD");

// ── Vault (owner methods, all 1 yocto so the wallet must use a full-access key) ──

export const withdraw = (amount: bigint, token = config.tokenId) =>
  call(config.vaultId, "withdraw", { token_id: token, amount: amount.toString() }, ONE_YOCTO, 100n, "Withdraw from Vault");

export const setAgent = (agentId: string, enabled: boolean) =>
  call(config.vaultId, "set_agent", { agent_id: agentId, enabled }, ONE_YOCTO, 30n, enabled ? "Authorise agent" : "Revoke agent");

export const setOwnerLimits = (maxBasket: bigint | null, dailyCap: bigint | null) =>
  call(
    config.vaultId,
    "set_owner_limits",
    { max_basket: maxBasket?.toString() ?? null, daily_cap: dailyCap?.toString() ?? null },
    ONE_YOCTO,
    30n,
    "Set my limits",
  );

/** The human lock: approve the hash of the exact basket bytes (FR-UI04). */
export const approveBasket = (hashHex: string, expiresAtMs: bigint | string) =>
  call(config.vaultId, "approve_basket", { hash_hex: hashHex, expires_at_ms: expiresAtMs.toString() }, ONE_YOCTO, 30n, "Approve exact basket");

export const revokeApproval = (hashHex: string) =>
  call(config.vaultId, "revoke_approval", { hash_hex: hashHex }, ONE_YOCTO, 30n, "Revoke approval");

// ── Sputnik DAO (council votes) ──

export type VoteAction = "VoteApprove" | "VoteReject" | "VoteRemove";

/**
 * Sputnik v2 act_proposal. Some Sputnik versions also require the proposal `kind` to guard against
 * a proposal being swapped under the voter; pass it when Isaac's docs/dao.md says so (D-05).
 */
export const actProposal = (id: number, action: VoteAction, proposalKind?: unknown) =>
  call(config.daoId, "act_proposal", { id, action, ...(proposalKind ? { proposal: proposalKind } : {}) }, 0n, 150n, `${action} on proposal #${id}`);

/** Transaction hash from whatever the wallet returns (FinalExecutionOutcome). */
export function txHash(outcome: unknown): string | null {
  const o = outcome as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } } | null;
  return o?.transaction?.hash ?? o?.transaction_outcome?.id ?? null;
}
