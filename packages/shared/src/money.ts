/** Integer-only money helpers (PRD NFR-04). Amounts are bigint everywhere; strings on the wire. */

export interface TokenRate {
  decimals: number; // token decimals (cpUSD: 6)
  rate_micro: number; // token units per 1 USD, in micro (1 USD = 1 cpUSD → 1_000_000)
}

const MICRO = 1_000_000n;

function pow10(n: number): bigint {
  if (!Number.isInteger(n) || n < 0 || n > 36) throw new Error('decimals out of range');
  return 10n ** BigInt(n);
}

/**
 * micro-USD → token base units, floored.
 * base = micro_usd × rate_micro × 10^decimals / (10^6 × 10^6)
 */
export function microUsdToBaseUnits(microUsd: bigint, rate: TokenRate): bigint {
  if (microUsd < 0n) throw new Error('negative amount');
  return (microUsd * BigInt(rate.rate_micro) * pow10(rate.decimals)) / (MICRO * MICRO);
}

/** Format base units for display, truncating (never rounding up) to `shown` decimals. */
export function formatBaseUnits(amount: bigint, decimals = 6, shown = 2): string {
  const neg = amount < 0n;
  const abs = neg ? -amount : amount;
  const unit = pow10(decimals);
  const whole = abs / unit;
  const frac = (abs % unit).toString().padStart(decimals, '0').slice(0, shown);
  return `${neg ? '-' : ''}${whole.toString()}${shown > 0 ? `.${frac.padEnd(shown, '0')}` : ''}`;
}

/** Parse a decimal string ("12.5") into base units without floats. */
export function parseDecimalToBaseUnits(value: string, decimals = 6): bigint {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) throw new Error(`not a non-negative decimal: ${value}`);
  const frac = m[2] ?? '';
  if (frac.length > decimals) throw new Error(`more than ${decimals} decimal places`);
  return BigInt(m[1]!) * pow10(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
}

export function formatMicroUsd(micro: bigint): string {
  return `$${formatBaseUnits(micro, 6, 2)}`;
}
