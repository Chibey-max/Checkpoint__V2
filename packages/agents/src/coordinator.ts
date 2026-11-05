/**
 * Coordinator (task D-3.2, PRD §7.3 step 5, FR-AG05/06). Pure: no I/O.
 *
 * Eligible offers per item are ALLOW offers plus REVIEW offers the owner has
 * acknowledged (the acknowledgement fix in docs/decisions-pending.md). If an
 * item has none, its cheapest REVIEW offer is chosen and flagged needs_ack.
 *
 * Among all combinations within max_vendors, the basket minimises, in order:
 * total price, then non-preferred vendors, then vendor count, then the
 * lexical offer IDs. Amounts use the same pricing code as Guard.
 */
import {
  groupPayouts,
  lineAmountBaseUnits,
  unitPriceMicro,
  type BasketContent,
  type BasketLine,
  type ItemRequest,
  type Offer,
  type TokenRate,
  type Verdict,
} from '@checkpoint/shared';

export interface CoordinatorInput {
  request_id: string;
  basket_id: string;
  owner_id: string;
  token_id: string;
  items: ItemRequest[];
  offers: readonly Offer[];
  verdicts: Readonly<Record<string, Verdict>>;
  acknowledged_offer_ids: readonly string[];
  preferred_vendors?: readonly string[];
  max_vendors: number;
  rate: TokenRate;
}

export type CoordinatorResult =
  | { ok: true; basket: BasketContent; needs_ack: string[]; unfilled: string[] }
  | { ok: false; code: 'NO_ELIGIBLE_OFFER' | 'VENDOR_CAP'; message: string; unfilled: string[] };

interface Candidate {
  item_key: string;
  qty: number;
  offer: Offer;
  verdict: Verdict;
  unit: bigint;
  amount: bigint;
  needs_ack: boolean;
}

const MAX_CANDIDATES_PER_ITEM = 6;

function cmpBig(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function planBasket(input: CoordinatorInput): CoordinatorResult {
  const acks = new Set(input.acknowledged_offer_ids);
  const preferred = new Set(input.preferred_vendors ?? []);
  const perItem: Candidate[][] = [];
  const unfilled: string[] = [];

  for (const it of input.items) {
    const all = input.offers
      .filter((o) => o.item_key === it.item_key)
      .map((offer) => ({
        offer,
        verdict: input.verdicts[offer.offer_id],
        unit: unitPriceMicro(offer),
      }))
      .filter(
        (c): c is { offer: Offer; verdict: Verdict; unit: bigint } =>
          !!c.verdict && c.unit !== null,
      );
    const toCand = (
      c: { offer: Offer; verdict: Verdict; unit: bigint },
      needs_ack: boolean,
    ): Candidate => ({
      item_key: it.item_key,
      qty: it.qty,
      offer: c.offer,
      verdict: c.verdict,
      unit: c.unit,
      amount: lineAmountBaseUnits(c.unit, it.qty, input.rate),
      needs_ack,
    });
    const eligible = all
      .filter(
        (c) =>
          c.verdict.level === 'ALLOW' ||
          (c.verdict.level === 'REVIEW' && acks.has(c.offer.offer_id)),
      )
      .map((c) => toCand(c, false));
    const pool = eligible.length
      ? eligible
      : all.filter((c) => c.verdict.level === 'REVIEW').map((c) => toCand(c, true));
    if (!pool.length) {
      unfilled.push(it.item_key);
      continue;
    }
    pool.sort(
      (a, b) =>
        cmpBig(a.unit, b.unit) ||
        (preferred.has(b.offer.vendor_id) ? 1 : 0) - (preferred.has(a.offer.vendor_id) ? 1 : 0) ||
        (a.offer.offer_id < b.offer.offer_id ? -1 : 1),
    );
    // needs_ack fallback: only the cheapest REVIEW offer (PRD §7.3 step 5)
    perItem.push(eligible.length ? pool.slice(0, MAX_CANDIDATES_PER_ITEM) : pool.slice(0, 1));
  }

  if (!perItem.length) {
    return {
      ok: false,
      code: 'NO_ELIGIBLE_OFFER',
      message: 'No item has an offer that passed the rules.',
      unfilled,
    };
  }

  let best: { combo: Candidate[]; key: [bigint, number, number, string] } | null = null;
  const combo: Candidate[] = [];
  const walk = (i: number) => {
    if (i === perItem.length) {
      const vendors = new Set(combo.map((c) => c.offer.vendor_id));
      if (vendors.size > input.max_vendors) return;
      const total = combo.reduce((s, c) => s + c.amount, 0n);
      const nonPreferred = combo.filter((c) => !preferred.has(c.offer.vendor_id)).length;
      const ids = combo.map((c) => c.offer.offer_id).join('\u0000');
      const key: [bigint, number, number, string] = [total, nonPreferred, vendors.size, ids];
      if (
        !best ||
        cmpBig(key[0], best.key[0]) < 0 ||
        (key[0] === best.key[0] &&
          (key[1] < best.key[1] ||
            (key[1] === best.key[1] &&
              (key[2] < best.key[2] || (key[2] === best.key[2] && key[3] < best.key[3])))))
      ) {
        best = { combo: [...combo], key };
      }
      return;
    }
    for (const c of perItem[i]!) {
      combo.push(c);
      walk(i + 1);
      combo.pop();
    }
  };
  walk(0);

  if (!best) {
    return {
      ok: false,
      code: 'VENDOR_CAP',
      message: `No combination of allowed offers fits within ${input.max_vendors} vendors.`,
      unfilled,
    };
  }
  const chosen = (best as { combo: Candidate[] }).combo;
  const lines: BasketLine[] = chosen.map((c) => ({
    item_key: c.item_key,
    offer_id: c.offer.offer_id,
    vendor_id: c.offer.vendor_id,
    qty: c.qty,
    unit_price_micro: c.unit.toString(),
    amount: c.amount.toString(),
    level: c.verdict.level,
    needs_ack: c.verdict.level === 'REVIEW' && !acks.has(c.offer.offer_id),
  }));
  const { payouts, total } = groupPayouts(
    chosen.map((c) => ({ vendor_id: c.offer.vendor_id, amount: c.amount })),
  );
  return {
    ok: true,
    basket: {
      basket_id: input.basket_id,
      request_id: input.request_id,
      owner_id: input.owner_id,
      token_id: input.token_id,
      lines,
      payouts: payouts.map((p) => ({
        vendor_id: p.vendor_id,
        amount: p.amount.toString(),
        line_count: p.line_count,
      })),
      total: total.toString(),
    },
    needs_ack: lines.filter((l) => l.needs_ack).map((l) => l.offer_id),
    unfilled,
  };
}
