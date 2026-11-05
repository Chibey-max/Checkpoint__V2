import { z } from 'zod';
import { canonicalJson } from './canonical';
import { sha256 } from './crypto';
import { toHex, utf8ToBytes } from './encoding';

/**
 * Guard rules config (PRD §9.4). Hashed and pinned in the Vault, so a change
 * needs a DAO vote.
 *
 * Differences from PRD §9.4 (see docs/decisions-pending.md):
 * - max_age_hours defaults to 720, not 168, so a snapshot captured on
 *   5–6 Nov does not go stale before judging.
 * - usd_to_token has no `token` field: the token comes from Vault policy and
 *   the payload, so one rules_hash works on sandbox and testnet.
 */
export const RulesConfigSchema = z
  .strictObject({
    version: z.literal(1),
    min_offers: z.int().min(1).max(100),
    max_age_hours: z
      .int()
      .min(1)
      .max(24 * 365),
    bps: z.strictObject({
      good_max: z.int().min(1),
      fair_max: z.int().min(1),
      low_min: z.int().min(0),
    }),
    currency: z.literal('USD'),
    usd_to_token: z.strictObject({
      decimals: z.int().min(0).max(24),
      rate_micro: z.int().min(1),
    }),
  })
  .refine((c) => c.bps.low_min < c.bps.good_max && c.bps.good_max <= c.bps.fair_max, {
    message: 'bps thresholds must satisfy low_min < good_max <= fair_max',
  });

export type RulesConfig = z.infer<typeof RulesConfigSchema>;

export const DEFAULT_RULES_CONFIG: RulesConfig = {
  version: 1,
  min_offers: 3,
  max_age_hours: 720,
  bps: { good_max: 10_500, fair_max: 12_000, low_min: 5_000 },
  currency: 'USD',
  usd_to_token: { decimals: 6, rate_micro: 1_000_000 },
};

export function canonicalRulesConfig(config: RulesConfig): string {
  return canonicalJson(RulesConfigSchema.parse(config));
}

/** rules_hash = sha256(canonical JSON of the config), lowercase hex. */
export function rulesHashHex(config: RulesConfig): string {
  return toHex(sha256(utf8ToBytes(canonicalRulesConfig(config))));
}
