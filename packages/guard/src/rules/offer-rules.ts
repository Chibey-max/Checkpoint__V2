/**
 * Offer rules R-01 to R-10 (PRD §9.1–9.2). Pure: no I/O, no clock, no floats.
 * The same input always gives the same output (FR-R01).
 */
import {
  unitPriceMicro,
  type CatalogItem,
  type Finding,
  type Offer,
  type RulesConfig,
  type Verdict,
} from '@checkpoint/shared';

export { unitPriceMicro };
import { finding, mostSevere, pct, toSafeInt, usd } from './findings';

export interface OfferRuleContext {
  config: RulesConfig;
  rulesHash: string;
  catalog: ReadonlyMap<string, CatalogItem>;
  /** Live Vault vendor allowlist (R-04). */
  allowedVendors: ReadonlySet<string>;
  /** The clock is an input, so the rules stay pure and replayable. */
  nowMs: number;
}

export interface ItemAssessment {
  item_key: string;
  median_micro: bigint | null;
  valid_count: number;
  verdicts: Verdict[];
}

const FUTURE_SKEW_MS = 5 * 60_000;

/** Median of integer prices; for an even count, the floored mean of the two middle values. */
export function medianMicro(prices: bigint[]): bigint | null {
  if (prices.length === 0) return null;
  const s = [...prices].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2n;
}

/** r = floor(p × 10 000 / m) */
export function ratioBps(p: bigint, m: bigint): bigint {
  return (p * 10_000n) / m;
}

function isHttpUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** R-01: returns the list of data problems (empty = valid data). */
export function dataProblems(o: Offer, nowMs: number): string[] {
  const p: string[] = [];
  if (!o.seller_name?.trim()) p.push('missing seller');
  if (!isHttpUrl(o.source_url)) p.push(o.source_url ? 'invalid source URL' : 'missing source URL');
  const t = o.captured_at ? Date.parse(o.captured_at) : NaN;
  if (Number.isNaN(t))
    p.push(o.captured_at ? 'invalid capture timestamp' : 'missing capture timestamp');
  else if (t > nowMs + FUTURE_SKEW_MS) p.push('capture timestamp is in the future');
  if (!Number.isSafeInteger(o.price_total_micro_usd) || (o.price_total_micro_usd ?? 0) <= 0) {
    p.push(o.price_total_micro_usd === undefined ? 'missing price' : 'invalid price');
  }
  if (
    o.fees_micro_usd !== undefined &&
    o.price_total_micro_usd !== undefined &&
    o.fees_micro_usd > o.price_total_micro_usd
  ) {
    p.push('fees exceed the total price');
  }
  if (o.currency !== 'USD')
    p.push(o.currency ? `currency is ${o.currency}, not USD` : 'missing currency');
  if (!Number.isSafeInteger(o.quantity) || (o.quantity ?? 0) <= 0)
    p.push('quantity must be a positive integer');
  return p;
}

/** R-10: returns the spec shortfalls against the item's minimum spec. */
export function specProblems(o: Offer, item: CatalogItem): string[] {
  const p: string[] = [];
  const spec = (o.spec ?? {}) as Record<string, unknown>;
  for (const [key, min] of Object.entries(item.min_spec)) {
    if (min === undefined) continue;
    const have = spec[key];
    if (typeof min === 'number') {
      if (typeof have !== 'number') p.push(`${key} not stated`);
      else if (have < min) p.push(`${key} ${have} < ${min}`);
    } else if (typeof min === 'string') {
      const norm = (s: string) => s.trim().toLowerCase().replace(/^\./, '');
      if (typeof have !== 'string') p.push(`${key} not stated`);
      else if (norm(have) !== norm(min)) p.push(`${key} ${have} ≠ ${min}`);
    }
  }
  return p;
}

function norm(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Same seller + same product → one listing. Falls back to the title when no fingerprint (D-1.1 note). */
export function dedupeKey(o: Offer): string {
  return `${norm(o.seller_name)}|${norm(o.product_fingerprint || o.product_title || o.offer_id)}`;
}

function cmpBig(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Assess every offer of one item. `offers` must be all offers with this
 * item_key (the median is over the whole item, not just the requested IDs).
 */
export function assessItem(
  itemKey: string,
  offers: Offer[],
  ctx: OfferRuleContext,
  assessedAt: string,
): ItemAssessment {
  const item = ctx.catalog.get(itemKey);
  const { config } = ctx;
  const findings = new Map<string, Finding[]>(offers.map((o) => [o.offer_id, []]));
  const add = (id: string, f: Finding) => findings.get(id)!.push(f);

  // R-01 and R-10 decide validity. Invalid offers are left out of the median.
  const valid: Offer[] = [];
  for (const o of offers) {
    const data = dataProblems(o, ctx.nowMs);
    if (data.length) {
      add(
        o.offer_id,
        finding('R-01', 'BLOCK', `Invalid data: ${data.join('; ')}.`, {
          problems: data.join('; '),
        }),
      );
      continue;
    }
    const spec = item ? specProblems(o, item) : ['item is not in the catalogue'];
    if (spec.length) {
      add(
        o.offer_id,
        finding('R-10', 'BLOCK', `Below the item's minimum spec: ${spec.join('; ')}.`, {
          problems: spec.join('; '),
        }),
      );
      continue;
    }
    valid.push(o);
  }

  // R-09: keep the lowest-priced listing per (seller, product); block and exclude the rest.
  const groups = new Map<string, Offer[]>();
  for (const o of valid) groups.set(dedupeKey(o), [...(groups.get(dedupeKey(o)) ?? []), o]);
  const kept: Offer[] = [];
  const duplicates: { offer: Offer; keptId: string }[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort(
      (a, b) =>
        cmpBig(unitPriceMicro(a)!, unitPriceMicro(b)!) || (a.offer_id < b.offer_id ? -1 : 1),
    );
    kept.push(sorted[0]!);
    for (const d of sorted.slice(1)) duplicates.push({ offer: d, keptId: sorted[0]!.offer_id });
  }
  for (const { offer, keptId } of duplicates) {
    add(
      offer.offer_id,
      finding(
        'R-09',
        'BLOCK',
        `Duplicate listing of ${keptId} (same seller and product); only the lowest is kept and this one is excluded from the median.`,
        { kept_offer_id: keptId },
      ),
    );
  }

  const median = medianMicro(kept.map((o) => unitPriceMicro(o)!));
  const count = kept.length;

  // R-03 applies to every offer of the item.
  if (count < config.min_offers) {
    for (const o of offers) {
      add(
        o.offer_id,
        finding(
          'R-03',
          'REVIEW',
          `Only ${count} valid offer(s) for this item; at least ${config.min_offers} are needed for a reliable median.`,
          { count, min_offers: config.min_offers },
        ),
      );
    }
  }

  const goodMax = BigInt(config.bps.good_max);
  const fairMax = BigInt(config.bps.fair_max);
  const lowMin = BigInt(config.bps.low_min);
  const ratios = new Map<string, bigint>();

  for (const o of kept) {
    const p = unitPriceMicro(o)!;
    const r = ratioBps(p, median!);
    ratios.set(o.offer_id, r);
    const inputs = {
      unit_price_micro: p.toString(),
      median_micro: median!.toString(),
      ratio_bps: toSafeInt(r),
      count,
    };
    const vs = `${usd(p)} vs median ${usd(median!)}`;
    if (r > fairMax) {
      add(
        o.offer_id,
        finding(
          'R-05',
          'BLOCK',
          `Price is ${pct(r)} of the median (${vs}), above the ${pct(fairMax)} limit.`,
          inputs,
        ),
      );
    } else if (r > goodMax) {
      add(
        o.offer_id,
        finding(
          'R-06',
          'REVIEW',
          `Price is ${pct(r)} of the median (${vs}), between ${pct(goodMax)} and ${pct(fairMax)}.`,
          inputs,
        ),
      );
    } else if (r < lowMin) {
      add(
        o.offer_id,
        finding(
          'R-07',
          'REVIEW',
          `Price is ${pct(r)} of the median (${vs}), under ${pct(lowMin)}: unusually low, check before buying.`,
          inputs,
        ),
      );
    } else {
      add(
        o.offer_id,
        finding('R-08', 'ALLOW', `Price is ${pct(r)} of the median (${vs}).`, inputs),
      );
    }
  }

  for (const o of offers) {
    // R-02 needs a valid timestamp; R-01 already reports a bad one.
    const t = o.captured_at ? Date.parse(o.captured_at) : NaN;
    if (!Number.isNaN(t)) {
      const ageHours = Math.floor((ctx.nowMs - t) / 3_600_000);
      if (ctx.nowMs - t > config.max_age_hours * 3_600_000) {
        add(
          o.offer_id,
          finding(
            'R-02',
            'REVIEW',
            `Captured ${ageHours} h ago, more than the ${config.max_age_hours} h limit.`,
            { age_hours: ageHours, max_age_hours: config.max_age_hours },
          ),
        );
      }
    }
    // R-04 applies to every offer, valid or not.
    if (!ctx.allowedVendors.has(o.vendor_id)) {
      add(
        o.offer_id,
        finding('R-04', 'BLOCK', `Vendor ${o.vendor_id} is not on the Vault allowlist.`, {
          vendor_id: o.vendor_id,
        }),
      );
    }
  }

  const verdicts: Verdict[] = offers.map((o) => {
    const fs = findings.get(o.offer_id)!;
    const p = unitPriceMicro(o);
    const r = ratios.get(o.offer_id);
    return {
      offer_id: o.offer_id,
      item_key: itemKey,
      vendor_id: o.vendor_id,
      level: mostSevere(fs),
      findings: fs,
      unit_price_micro: p === null ? null : p.toString(),
      ratio_bps:
        r === undefined
          ? p !== null && median
            ? toSafeInt(ratioBps(p, median))
            : null
          : toSafeInt(r),
      assessed_at: assessedAt,
      rules_hash: ctx.rulesHash,
    };
  });

  return { item_key: itemKey, median_micro: median, valid_count: count, verdicts };
}
