/**
 * Guard and agents HTTP API and SSE events (PRD §11.4–11.5, frozen).
 * Patrick's web app and the mock server use these same schemas, so a change
 * here breaks them at compile time. docs/api.md has examples.
 */
import { z } from 'zod';
import { RulesConfigSchema } from './rules-config';
import {
  AccountIdSchema,
  BasketDraftSchema,
  BasketStatusSchema,
  CatalogItemSchema,
  ConstraintsSchema,
  FindingSchema,
  Hex32Schema,
  IsoTimeSchema,
  ItemRequestSchema,
  OfferSchema,
  PayoutSchema,
  SignedBasketSchema,
  UintStringSchema,
  UnmatchedSchema,
  UuidSchema,
  VerdictSchema,
} from './schemas';

// ───────────────────────────── Guard (port 8787) ─────────────────────────────

export const GuardHealthResponseSchema = z.object({
  ok: z.boolean(),
  rpc_ok: z.boolean(),
  vault_policy_version: z.int().nullable(),
  rules_hash_match: z.boolean().nullable(),
});

export const GuardPolicyResponseSchema = z.object({
  rules: RulesConfigSchema,
  rules_hash: Hex32Schema,
  guard_pubkey_b58: z.string(),
  guard_key_version: z.int(),
  vault_id: AccountIdSchema,
  network_id: z.string(),
});

/** POST /v1/assess. Offer IDs only: any price field is rejected with 400 (FR-R02). */
export const AssessRequestSchema = z.strictObject({
  offer_ids: z.array(z.string().min(1)).min(1).max(200),
  owner_id: AccountIdSchema.optional(),
});
export type AssessRequest = z.infer<typeof AssessRequestSchema>;

export const AssessResponseSchema = z.object({
  verdicts: z.array(VerdictSchema),
  medians: z.record(z.string(), UintStringSchema.nullable()),
  assessed_at: IsoTimeSchema,
});
export type AssessResponse = z.infer<typeof AssessResponseSchema>;

export const SignLineSchema = z.strictObject({
  item_key: z.string(),
  offer_id: z.string(),
  qty: z.int().min(1).max(20),
});

/** POST /v1/sign-basket. Guard rebuilds every amount from the offer IDs (FR-R04). */
export const SignBasketRequestSchema = z.strictObject({
  request_id: UuidSchema,
  basket_id: UuidSchema.optional(), // added: lets the agents keep one basket_id per draft
  owner_id: AccountIdSchema,
  agent_id: AccountIdSchema,
  token_id: AccountIdSchema,
  lines: z.array(SignLineSchema).min(1).max(20),
  acknowledged_offer_ids: z.array(z.string()).max(200),
  evidence_hash: Hex32Schema,
});
export type SignBasketRequest = z.infer<typeof SignBasketRequestSchema>;

export const SignBasketResponseSchema = SignedBasketSchema.extend({
  basket_id: UuidSchema,
  payouts: z.array(PayoutSchema),
  total: UintStringSchema,
  findings: z.array(FindingSchema),
});
export type SignBasketResponse = z.infer<typeof SignBasketResponseSchema>;

export const GuardErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'PRICE_FIELD_REJECTED',
  'UNKNOWN_OFFER',
  'GUARD_REFUSED',
  'GUARD_DEPENDENCY_DOWN',
  'RULES_HASH_MISMATCH',
  'GUARD_KEY_MISMATCH',
  'RATE_LIMITED',
  'NOT_FOUND',
  'INTERNAL',
]);
export type GuardErrorCode = z.infer<typeof GuardErrorCodeSchema>;

export const GuardErrorSchema = z.object({
  code: GuardErrorCodeSchema,
  message: z.string(),
  findings: z.array(FindingSchema).optional(),
  details: z.unknown().optional(),
});
export type GuardError = z.infer<typeof GuardErrorSchema>;

// ──────────────────────────── Agents (port 8788) ────────────────────────────

export const CreateRequestSchema = z.strictObject({
  owner_id: AccountIdSchema,
  text: z.string().min(1).max(2000),
  constraints: ConstraintsSchema.optional(),
});
export type CreateRequest = z.infer<typeof CreateRequestSchema>;

export const CreateRequestResponseSchema = z.object({ request_id: UuidSchema });

export const AcknowledgeRequestSchema = z.strictObject({
  offer_ids: z.array(z.string().min(1)).min(1).max(50),
});

export const CatalogResponseSchema = z.object({ items: z.array(CatalogItemSchema) });

export const RequestStateSchema = z.enum([
  'created',
  'parsed',
  'researched',
  'assessed',
  'needs_ack',
  'signed',
  'awaiting_approval',
  'executing',
  'final',
  'refused',
  'expired',
  'cancelled', // added for POST /cancel
]);
export type RequestState = z.infer<typeof RequestStateSchema>;

// SSE events: names frozen (§11.5). Envelope {seq, ts, type, data}.

const ev = <T extends string, D extends z.ZodType>(type: T, data: D) =>
  z.object({ seq: z.int().min(1), ts: IsoTimeSchema, type: z.literal(type), data });

export const ParserSchema = z.enum(['deterministic', 'llm']);
export const TextSourceSchema = z.enum(['llm', 'template']);

export const AgentEventSchema = z.discriminatedUnion('type', [
  ev(
    'request.created',
    z.object({
      request_id: UuidSchema,
      owner_id: AccountIdSchema,
      text: z.string(),
      constraints: ConstraintsSchema,
    }),
  ),
  ev('research.parsed', z.object({ items: z.array(ItemRequestSchema), parser: ParserSchema })),
  ev('research.unmatched', z.object({ unmatched: z.array(UnmatchedSchema) })),
  ev('research.offer', z.object({ offer: OfferSchema })),
  ev(
    'policy.verdict',
    z.object({ verdict: VerdictSchema, median_micro: UintStringSchema.nullable() }),
  ),
  ev(
    'coordinator.basket',
    z.object({
      basket: BasketDraftSchema,
      acknowledged_offer_ids: z.array(z.string()),
    }),
  ),
  ev(
    'coordinator.needs_ack',
    z.object({
      offer_ids: z.array(z.string()),
      reasons: z.array(z.object({ offer_id: z.string(), findings: z.array(FindingSchema) })),
    }),
  ),
  ev(
    'guard.signed',
    z.object({
      signed: SignedBasketSchema,
      basket_id: UuidSchema,
      payouts: z.array(PayoutSchema),
      total: UintStringSchema,
      findings: z.array(FindingSchema),
    }),
  ),
  ev(
    'guard.refused',
    z.object({
      code: z.string(),
      message: z.string(),
      findings: z.array(FindingSchema),
    }),
  ),
  ev('approval.waiting', z.object({ hash_hex: Hex32Schema, expires_at_ms: z.int() })),
  ev('approval.seen', z.object({ hash_hex: Hex32Schema, owner_id: AccountIdSchema })),
  ev('approval.expired', z.object({ hash_hex: Hex32Schema })),
  ev('settlement.submitted', z.object({ hash_hex: Hex32Schema, tx_hash: z.string() })),
  ev(
    'settlement.payout',
    z.object({
      index: z.int().min(0),
      vendor_id: AccountIdSchema,
      amount: UintStringSchema,
      status: z.enum(['Completed', 'Failed']),
      tx_hash: z.string().nullable(),
    }),
  ),
  ev('settlement.final', z.object({ hash_hex: Hex32Schema, status: BasketStatusSchema })),
  ev(
    'explain.verdict',
    z.object({
      offer_id: z.string(),
      text: z.string(),
      source: TextSourceSchema,
      advisory: z.literal(true),
    }),
  ),
  ev(
    'explain.basket',
    z.object({ text: z.string(), source: TextSourceSchema, advisory: z.literal(true) }),
  ),
  ev('error', z.object({ code: z.string(), message: z.string(), recoverable: z.boolean() })),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentEventType = AgentEvent['type'];
export type AgentEventData<T extends AgentEventType> = Extract<AgentEvent, { type: T }>['data'];

export const AGENT_EVENT_TYPES = [
  'request.created',
  'research.parsed',
  'research.unmatched',
  'research.offer',
  'policy.verdict',
  'coordinator.basket',
  'coordinator.needs_ack',
  'guard.signed',
  'guard.refused',
  'approval.waiting',
  'approval.seen',
  'approval.expired',
  'settlement.submitted',
  'settlement.payout',
  'settlement.final',
  'explain.verdict',
  'explain.basket',
  'error',
] as const satisfies readonly AgentEventType[];
