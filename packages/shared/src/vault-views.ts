/**
 * The JSON shapes Guard, the agents and verify:audit expect from the Vault's
 * view methods (PRD FR-V08, FR-S09). The PRD names the views but not their
 * exact JSON, so these are a proposal for Isaac to confirm
 * (docs/decisions-pending.md, item 8). Amounts are U128 strings.
 */
import { z } from 'zod';
import { AccountIdSchema, Hex32Schema, UintStringSchema } from './schemas';

export const VaultPolicyViewSchema = z.object({
  network_id: z.string(),
  tokens: z.array(AccountIdSchema),
  vendors: z.array(AccountIdSchema),
  max_basket_total: UintStringSchema,
  daily_cap: UintStringSchema,
  max_vendors: z.int(),
  max_ttl_ms: z.union([z.int(), UintStringSchema]),
  rules_hash: Hex32Schema,
  guard_pubkey: z.string(), // base58 of the 32-byte ed25519 public key
  guard_key_version: z.int(),
  guard_key_disabled: z.boolean(),
  guardian: AccountIdSchema,
  dao_id: AccountIdSchema,
  policy_version: z.int(),
  paused: z.boolean(),
  deficit: z.boolean(),
});
export type VaultPolicyView = z.infer<typeof VaultPolicyViewSchema>;

export const VaultOwnerStateViewSchema = z.object({
  agents: z.array(AccountIdSchema),
  day: z.union([z.int(), UintStringSchema]), // UTC day index = block_timestamp_ms / 86_400_000
  spent_today: UintStringSchema,
  max_basket: UintStringSchema, // effective (min of owner and global)
  daily_cap: UintStringSchema, // effective
});
export type VaultOwnerStateView = z.infer<typeof VaultOwnerStateViewSchema>;

export const VaultBalanceViewSchema = z.object({
  available: UintStringSchema,
  reserved: UintStringSchema,
  withdrawing: UintStringSchema,
});
export type VaultBalanceView = z.infer<typeof VaultBalanceViewSchema>;

export const VaultApprovalViewSchema = z.object({
  owner: AccountIdSchema,
  expires_at_ms: z.union([z.int(), UintStringSchema]),
  created_at_ms: z.union([z.int(), UintStringSchema]),
});
export type VaultApprovalView = z.infer<typeof VaultApprovalViewSchema>;

export const VaultBasketViewSchema = z.object({
  hash: Hex32Schema,
  basket_id: z.string(),
  owner: AccountIdSchema,
  agent: AccountIdSchema,
  token: AccountIdSchema,
  total: UintStringSchema,
  evidence_hash: Hex32Schema,
  status: z.enum(['Executing', 'Completed', 'PartiallyPaid', 'Failed']),
  created_at_ms: z.union([z.int(), UintStringSchema]),
  payouts: z.array(
    z.object({
      vendor: AccountIdSchema,
      amount: UintStringSchema,
      status: z.enum(['Executing', 'Completed', 'Failed']),
    }),
  ),
});
export type VaultBasketView = z.infer<typeof VaultBasketViewSchema>;

export const UTC_DAY_MS = 86_400_000;

export function utcDayIndex(nowMs: number): number {
  return Math.floor(nowMs / UTC_DAY_MS);
}
