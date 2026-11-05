/** Off-chain records (PRD §10.2) as Zod schemas. Amounts are decimal strings of integers. */
import { z } from 'zod';
import { RulesConfigSchema } from './rules-config';

/** NEAR account ID (nomicon account-id rules: 2–64 chars). */
export const AccountIdSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/, 'invalid NEAR account ID');

export const UintStringSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, 'expected a non-negative integer string');
export const Hex32Schema = z.string().regex(/^[0-9a-f]{64}$/, 'expected 32 bytes of lowercase hex');
export const UuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    'expected lowercase uuid v4',
  );
export const IsoTimeSchema = z.iso.datetime({ offset: true });

export const LevelSchema = z.enum(['ALLOW', 'REVIEW', 'BLOCK']);
export type Level = z.infer<typeof LevelSchema>;

export const SpecSchema = z.object({
  vcpu: z.number().nonnegative().optional(),
  ram_gb: z.number().nonnegative().optional(),
  storage_gb: z.number().nonnegative().optional(),
  tld: z.string().optional(),
  emails_per_month: z.number().nonnegative().optional(),
  term_months: z.number().nonnegative().optional(),
});
export type Spec = z.infer<typeof SpecSchema>;

export const CatalogItemSchema = z.object({
  item_key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1),
  unit: z.string().min(1), // "vps-month", "domain-year", "storage-tb-month", …
  min_spec: SpecSchema,
  /** Lowercase phrases the deterministic parser matches (PRD §13). */
  aliases: z.array(z.string().min(1)).min(1),
});
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export const CaptureMethodSchema = z.enum(['manual', 'script', 'fixture']);

/**
 * An offer as loaded from the evidence store. Deliberately lenient: Guard's
 * R-01 (DATA_INVALID) decides whether the data is good enough, so a row with a
 * missing price still loads and gets a BLOCK verdict with a reason.
 * `pnpm snapshot:check` applies the strict schema below to captured rows.
 */
export const OfferSchema = z.object({
  offer_id: z.string().min(1).max(128),
  item_key: z.string().min(1),
  vendor_id: AccountIdSchema,
  seller_name: z.string().optional(),
  product_title: z.string().optional(),
  product_fingerprint: z.string().optional(),
  spec: SpecSchema.optional(),
  quantity: z.int().optional(),
  unit: z.string().optional(),
  price_total_micro_usd: z.int().optional(),
  fees_micro_usd: z.int().min(0).optional(),
  currency: z.string().optional(),
  source_url: z.string().optional(),
  captured_at: z.string().optional(),
  capture_method: CaptureMethodSchema.optional(),
  raw_text: z.string().max(500).optional(), // untrusted listing text; never parsed for decisions
  notes: z.string().optional(),
  screenshot: z.string().nullable().optional(), // null = no screenshot captured
});
export type Offer = z.infer<typeof OfferSchema>;

/** What a captured (non-fixture) row must contain to pass `pnpm snapshot:check`. */
export const StrictOfferSchema = OfferSchema.extend({
  seller_name: z.string().min(1),
  product_title: z.string().min(1),
  product_fingerprint: z.string().min(1),
  spec: SpecSchema,
  quantity: z.int().min(1),
  unit: z.string().min(1),
  price_total_micro_usd: z.int().min(1),
  fees_micro_usd: z.int().min(0),
  currency: z.literal('USD'),
  source_url: z.url({ protocol: /^https?$/ }),
  captured_at: IsoTimeSchema,
  capture_method: CaptureMethodSchema,
});

export const RuleIdSchema = z.enum([
  'R-01',
  'R-02',
  'R-03',
  'R-04',
  'R-05',
  'R-06',
  'R-07',
  'R-08',
  'R-09',
  'R-10',
  'R-20',
  'R-21',
  'R-22',
  'R-23',
  'R-24',
]);
export type RuleId = z.infer<typeof RuleIdSchema>;

export const FindingSchema = z.object({
  rule_id: RuleIdSchema,
  name: z.string(), // e.g. PRICE_POOR
  level: LevelSchema,
  message: z.string(),
  inputs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});
export type Finding = z.infer<typeof FindingSchema>;

export const VerdictSchema = z.object({
  offer_id: z.string(),
  item_key: z.string(),
  vendor_id: z.string(),
  level: LevelSchema,
  findings: z.array(FindingSchema),
  unit_price_micro: UintStringSchema.nullable(),
  ratio_bps: z.int().nullable(),
  assessed_at: IsoTimeSchema,
  rules_hash: Hex32Schema,
});
export type Verdict = z.infer<typeof VerdictSchema>;

export const ItemRequestSchema = z.object({
  item_key: z.string(),
  qty: z.int().min(1).max(20),
  notes: z.string().max(200).optional(),
});
export type ItemRequest = z.infer<typeof ItemRequestSchema>;

export const UnmatchedSchema = z.object({ text: z.string(), reason: z.string() });
export type Unmatched = z.infer<typeof UnmatchedSchema>;

export const ConstraintsSchema = z.object({
  max_total: UintStringSchema.optional(), // token base units
  preferred_vendors: z.array(AccountIdSchema).max(10).optional(),
});
export type Constraints = z.infer<typeof ConstraintsSchema>;

export const BasketLineSchema = z.object({
  item_key: z.string(),
  offer_id: z.string(),
  vendor_id: AccountIdSchema,
  qty: z.int().min(1),
  unit_price_micro: UintStringSchema,
  amount: UintStringSchema, // token base units
  level: LevelSchema,
  needs_ack: z.boolean(),
});
export type BasketLine = z.infer<typeof BasketLineSchema>;

export const PayoutSchema = z.object({
  vendor_id: AccountIdSchema,
  amount: UintStringSchema,
  line_count: z.int().min(1),
});
export type Payout = z.infer<typeof PayoutSchema>;

/** The basket as hashed into the evidence bundle (no evidence_hash inside it). */
export const BasketContentSchema = z.object({
  basket_id: UuidSchema,
  request_id: UuidSchema,
  owner_id: AccountIdSchema,
  token_id: AccountIdSchema,
  lines: z.array(BasketLineSchema),
  payouts: z.array(PayoutSchema),
  total: UintStringSchema,
});
export type BasketContent = z.infer<typeof BasketContentSchema>;

export const BasketDraftSchema = BasketContentSchema.extend({ evidence_hash: Hex32Schema });
export type BasketDraft = z.infer<typeof BasketDraftSchema>;

export const SignedBasketSchema = z.object({
  payload_b64: z.string(),
  hash_hex: Hex32Schema,
  signature_b64: z.string(),
  guard_key_version: z.int().min(0),
  expires_at_ms: z.int().min(0),
});
export type SignedBasket = z.infer<typeof SignedBasketSchema>;

/**
 * The part of the evidence bundle that evidence_hash covers. It holds only
 * what exists before signing, because the hash goes inside the signed payload
 * (fix for the circularity noted in docs/decisions-pending.md).
 */
export const EvidenceCoreSchema = z.object({
  schema: z.literal('checkpoint-evidence-v1'),
  request: z.object({
    request_id: UuidSchema,
    owner_id: AccountIdSchema,
    text: z.string(),
    constraints: ConstraintsSchema,
    items: z.array(ItemRequestSchema),
    unmatched: z.array(UnmatchedSchema),
  }),
  offers: z.array(OfferSchema),
  verdicts: z.array(VerdictSchema),
  rules: z.object({ config: RulesConfigSchema, rules_hash: Hex32Schema }),
  acknowledged_offer_ids: z.array(z.string()),
  basket: BasketContentSchema,
});
export type EvidenceCore = z.infer<typeof EvidenceCoreSchema>;

export const PayoutStatusSchema = z.enum(['Executing', 'Completed', 'Failed']);
export const BasketStatusSchema = z.enum(['Executing', 'Completed', 'PartiallyPaid', 'Failed']);

export const EvidenceBundleSchema = z.object({
  core: EvidenceCoreSchema,
  evidence_hash: Hex32Schema,
  /** Not hashed: added after signing and settlement. */
  signed: SignedBasketSchema.nullable(),
  chain: z.object({
    approve_tx: z.string().nullable(),
    execute_tx: z.string().nullable(),
    payouts: z.array(
      z.object({
        index: z.int(),
        vendor_id: z.string(),
        amount: UintStringSchema,
        status: PayoutStatusSchema,
      }),
    ),
    final_status: BasketStatusSchema.nullable(),
  }),
});
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;
