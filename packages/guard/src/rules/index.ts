import type { CatalogItem, Offer, RulesConfig, Verdict } from '@checkpoint/shared';
import { assessItem, type OfferRuleContext } from './offer-rules';

export * from './basket-rules';
export * from './findings';
export * from './offer-rules';

export interface AssessInput {
  /** The whole evidence store; medians are computed per item over all of it. */
  offers: readonly Offer[];
  catalog: readonly CatalogItem[];
  /** Which offers to return verdicts for. */
  offerIds: readonly string[];
  config: RulesConfig;
  rulesHash: string;
  allowedVendors: Iterable<string>;
  nowMs: number;
}

export interface AssessResult {
  verdicts: Verdict[];
  medians: Record<string, string | null>;
  assessed_at: string;
}

export class UnknownOfferError extends Error {
  constructor(readonly offerIds: string[]) {
    super(`unknown offer id(s): ${offerIds.join(', ')}`);
    this.name = 'UnknownOfferError';
  }
}

/**
 * Assess the requested offers (R-01 to R-10). Used identically by the HTTP API
 * and the CLI, so both return the same findings for the same input (FR-R03).
 */
export function assessOffers(input: AssessInput): AssessResult {
  const byId = new Map(input.offers.map((o) => [o.offer_id, o]));
  const unknown = input.offerIds.filter((id) => !byId.has(id));
  if (unknown.length) throw new UnknownOfferError(unknown);

  const assessedAt = new Date(input.nowMs).toISOString();
  const ctx: OfferRuleContext = {
    config: input.config,
    rulesHash: input.rulesHash,
    catalog: new Map(input.catalog.map((c) => [c.item_key, c])),
    allowedVendors: new Set(input.allowedVendors),
    nowMs: input.nowMs,
  };
  const wanted = new Set(input.offerIds);
  const itemKeys = [...new Set(input.offerIds.map((id) => byId.get(id)!.item_key))].sort();
  const verdicts: Verdict[] = [];
  const medians: Record<string, string | null> = {};
  for (const key of itemKeys) {
    const itemOffers = input.offers.filter((o) => o.item_key === key);
    const res = assessItem(key, itemOffers, ctx, assessedAt);
    medians[key] = res.median_micro === null ? null : res.median_micro.toString();
    verdicts.push(...res.verdicts.filter((v) => wanted.has(v.offer_id)));
  }
  // Return verdicts in the order requested.
  const order = new Map(input.offerIds.map((id, i) => [id, i]));
  verdicts.sort((a, b) => order.get(a.offer_id)! - order.get(b.offer_id)!);
  return { verdicts, medians, assessed_at: assessedAt };
}
