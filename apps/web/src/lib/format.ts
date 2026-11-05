/**
 * Amounts are bigint base units everywhere. Floats never touch an amount (PRD §14):
 * the UI shows 2 decimals, but hashes and transactions use exact base units.
 */
export const CPUSD_DECIMALS = 6;

/** 12_500_000n → "12.50 cpUSD". Truncates toward zero past `shown` decimals. */
export function formatAmount(units: bigint | string, opts: { decimals?: number; shown?: number; symbol?: string | null } = {}): string {
  const { decimals = CPUSD_DECIMALS, shown = 2, symbol = "cpUSD" } = opts;
  const v = typeof units === "string" ? BigInt(units) : units;
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0").slice(0, shown);
  if (shown === 0) frac = "";
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const num = `${neg ? "-" : ""}${wholeStr}${frac ? `.${frac}` : ""}`;
  return symbol ? `${num} ${symbol}` : num;
}

/** "12.5" → 12_500_000n. Throws on bad input or more decimals than the token has. */
export function parseAmount(input: string, decimals = CPUSD_DECIMALS): bigint {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(s)) throw new Error("Enter an amount like 12.50");
  const [w = "", f = ""] = s.split(".");
  if (f.length > decimals) throw new Error(`At most ${decimals} decimal places`);
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt(f.padEnd(decimals, "0") || "0");
}

/** Snapshot prices are micro-USD; 1 USD = 1 cpUSD, both 6 decimals (FR-AG06). */
export const formatUsdMicro = (micro: number | bigint) => `$${formatAmount(BigInt(micro), { symbol: null })}`;

/** Ratio in basis points → "104.5%". */
export const formatBps = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

/** NEAR yoctoNEAR → "0.25 NEAR". */
export const formatNear = (yocto: bigint | string, shown = 2) => formatAmount(yocto, { decimals: 24, shown, symbol: "NEAR" });

export const shortHash = (hex: string, n = 6) => (hex.length > 2 * n + 1 ? `${hex.slice(0, n)}…${hex.slice(-n)}` : hex);

export const ONE_YOCTO = 1n;
export const TGAS = 1_000_000_000_000n;
