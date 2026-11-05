/**
 * Pricing shared by Guard (/sign-basket) and the Coordinator, so both compute
 * identical line amounts and payouts. Integers only (NFR-04).
 */
import { compareUtf8 } from './encoding';
import { microUsdToBaseUnits, type TokenRate } from './money';
import type { Offer } from './schemas';

/** Normalised unit price p = floor(total landed price / quantity), integer micro-USD (PRD §9.1). */
export function unitPriceMicro(
  o: Pick<Offer, 'price_total_micro_usd' | 'quantity'>,
): bigint | null {
  const price = o.price_total_micro_usd;
  const qty = o.quantity;
  if (price === undefined || qty === undefined) return null;
  if (!Number.isSafeInteger(price) || !Number.isSafeInteger(qty) || price <= 0 || qty <= 0)
    return null;
  return BigInt(price) / BigInt(qty);
}

/** Line amount in token base units: floor(unit price × qty converted to the token). */
export function lineAmountBaseUnits(unitPrice: bigint, qty: number, rate: TokenRate): bigint {
  if (!Number.isSafeInteger(qty) || qty < 1) throw new Error('qty must be a positive integer');
  return microUsdToBaseUnits(unitPrice * BigInt(qty), rate);
}

export interface PayoutTotals {
  payouts: { vendor_id: string; amount: bigint; line_count: number }[];
  total: bigint;
}

/** Group lines by vendor, sorted by vendor_id byte order (the payload order, PRD §11.2). */
export function groupPayouts(
  lines: readonly { vendor_id: string; amount: bigint }[],
): PayoutTotals {
  const by = new Map<string, { amount: bigint; line_count: number }>();
  for (const l of lines) {
    const cur = by.get(l.vendor_id) ?? { amount: 0n, line_count: 0 };
    by.set(l.vendor_id, { amount: cur.amount + l.amount, line_count: cur.line_count + 1 });
  }
  const payouts = [...by.entries()]
    .map(([vendor_id, v]) => ({ vendor_id, ...v }))
    .sort((a, b) => compareUtf8(a.vendor_id, b.vendor_id));
  return { payouts, total: payouts.reduce((s, p) => s + p.amount, 0n) };
}
