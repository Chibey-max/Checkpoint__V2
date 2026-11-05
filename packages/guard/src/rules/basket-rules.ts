/** Basket rules R-20 to R-24 (PRD §9.3). Inputs are live Vault views. Pure. */
import type { Finding, Level } from '@checkpoint/shared';
import { cpusd, finding } from './findings';

export interface BasketRuleInput {
  token_id: string;
  total: bigint;
  vendor_count: number;
  lines: { offer_id: string; level: Level }[];
  acknowledged_offer_ids: ReadonlySet<string>;
  vault: {
    tokens: readonly string[];
    effective_max_basket: bigint;
    effective_daily_cap: bigint;
    /** Already rolled over: 0 if the stored day is not today. */
    spent_today: bigint;
    max_vendors: number;
    available: bigint;
  };
  decimals?: number;
}

/** Returns BLOCK findings only; an empty list means every basket rule passes. */
export function assessBasket(b: BasketRuleInput): Finding[] {
  const out: Finding[] = [];
  const fmt = (v: bigint) => cpusd(v, b.decimals ?? 6);
  const { vault } = b;

  if (b.total > vault.effective_max_basket) {
    out.push(
      finding(
        'R-20',
        'BLOCK',
        `Basket total ${fmt(b.total)} is over the per-basket cap of ${fmt(vault.effective_max_basket)}.`,
        { total: b.total.toString(), cap: vault.effective_max_basket.toString() },
      ),
    );
  }
  if (vault.spent_today + b.total > vault.effective_daily_cap) {
    out.push(
      finding(
        'R-21',
        'BLOCK',
        `Spent today ${fmt(vault.spent_today)} plus this basket ${fmt(b.total)} is over the daily cap of ${fmt(vault.effective_daily_cap)}.`,
        {
          spent_today: vault.spent_today.toString(),
          total: b.total.toString(),
          cap: vault.effective_daily_cap.toString(),
        },
      ),
    );
  }
  if (b.vendor_count > vault.max_vendors) {
    out.push(
      finding(
        'R-22',
        'BLOCK',
        `The basket pays ${b.vendor_count} vendors; the limit is ${vault.max_vendors}.`,
        { vendors: b.vendor_count, max_vendors: vault.max_vendors },
      ),
    );
  }
  if (!vault.tokens.includes(b.token_id)) {
    out.push(
      finding('R-23', 'BLOCK', `Token ${b.token_id} is not on the Vault allowlist.`, {
        token_id: b.token_id,
      }),
    );
  } else if (vault.available < b.total) {
    out.push(
      finding(
        'R-23',
        'BLOCK',
        `Available balance ${fmt(vault.available)} is less than the basket total ${fmt(b.total)}.`,
        { available: vault.available.toString(), total: b.total.toString() },
      ),
    );
  }
  for (const line of b.lines) {
    if (line.level === 'REVIEW' && !b.acknowledged_offer_ids.has(line.offer_id)) {
      out.push(
        finding(
          'R-24',
          'BLOCK',
          `Offer ${line.offer_id} needs review and the owner has not acknowledged it.`,
          { offer_id: line.offer_id },
        ),
      );
    }
  }
  return out;
}
