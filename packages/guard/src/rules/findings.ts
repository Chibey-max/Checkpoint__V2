import type { Finding, Level, RuleId } from '@checkpoint/shared';

export const RULE_NAMES: Record<RuleId, string> = {
  'R-01': 'DATA_INVALID',
  'R-02': 'STALE',
  'R-03': 'INSUFFICIENT_DATA',
  'R-04': 'VENDOR_NOT_ALLOWED',
  'R-05': 'PRICE_POOR',
  'R-06': 'PRICE_FAIR',
  'R-07': 'PRICE_UNUSUALLY_LOW',
  'R-08': 'PRICE_GOOD',
  'R-09': 'DUPLICATE_LISTING',
  'R-10': 'SPEC_MISMATCH',
  'R-20': 'OVER_BASKET_CAP',
  'R-21': 'OVER_DAILY_CAP',
  'R-22': 'TOO_MANY_VENDORS',
  'R-23': 'TOKEN_OR_BALANCE',
  'R-24': 'REVIEW_NOT_ACKNOWLEDGED',
};

const SEVERITY: Record<Level, number> = { ALLOW: 0, REVIEW: 1, BLOCK: 2 };

export function finding(
  rule_id: RuleId,
  level: Level,
  message: string,
  inputs: Finding['inputs'] = {},
): Finding {
  return { rule_id, name: RULE_NAMES[rule_id], level, message, inputs };
}

/** Verdict = most severe level among the findings (BLOCK > REVIEW > ALLOW). */
export function mostSevere(findings: Finding[]): Level {
  return findings.reduce<Level>(
    (acc, f) => (SEVERITY[f.level] > SEVERITY[acc] ? f.level : acc),
    'ALLOW',
  );
}

/** 10_833 bps → "108.33%" (integer formatting, no floats). */
export function pct(bps: bigint): string {
  return `${bps / 100n}.${(bps % 100n).toString().padStart(2, '0')}%`;
}

/** micro-USD → "$12.50" */
export function usd(micro: bigint): string {
  const cents = micro / 10_000n;
  return `$${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

/** base units (6 decimals) → "12.50 cpUSD" */
export function cpusd(base: bigint, decimals = 6): string {
  const unit = 10n ** BigInt(decimals);
  const cents = (base * 100n) / unit;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')} cpUSD`;
}

/** bigint → number for small, bounded values (bps ratios, counts). Throws if unsafe. */
export function toSafeInt(v: bigint): number {
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error('value is outside the safe integer range');
  }
  // eslint-disable-next-line no-restricted-syntax -- bounded by the check above; not money
  return Number(v);
}
