/**
 * Deterministic list parser (PRD §13, FR-AG11): the default for the sandbox
 * demo and CI, so the AI screener needs no API key. Matches catalogue aliases
 * plus quantities. Anything it cannot map goes to `unmatched`; it never guesses.
 */
import type { CatalogItem, ItemRequest, Unmatched } from '@checkpoint/shared';

export interface ParseResult {
  items: ItemRequest[];
  unmatched: Unmatched[];
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const UNIT_WORDS =
  /^(tb|gb|mb|vcpu|vcpus|cpu|cpus|core|cores|month|months|mo|year|years|yr|k|emails?)\b/;
const MAX_QTY = 20;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/×/g, 'x').replace(/\s+/g, ' ').trim();
}

/** Leading multiplier: "2x vps", "2 x vps", "two vps", "x2". Numbers followed by a unit are specs, not counts. */
function multiplier(chunk: string): number | null {
  const lead = /^(\d+)\s*x(?=\s|$)/.exec(chunk);
  if (lead) return Number.parseInt(lead[1]!, 10);
  const bare = /^(\d+)\s+(.*)$/.exec(chunk);
  if (bare && !UNIT_WORDS.test(bare[2]!)) return Number.parseInt(bare[1]!, 10);
  const word = /^([a-z]+)\s/.exec(chunk);
  if (word && word[1]! in NUMBER_WORDS) return NUMBER_WORDS[word[1]!]!;
  const trail = /(?:^|\s)x\s*(\d+)$|(?:^|\s)(\d+)\s*x$/.exec(chunk);
  if (trail) return Number.parseInt((trail[1] ?? trail[2])!, 10);
  return null;
}

export function parseDeterministic(text: string, catalog: readonly CatalogItem[]): ParseResult {
  const aliases = catalog
    .flatMap((c) => c.aliases.map((a) => ({ alias: normalise(a), item: c })))
    .sort((a, b) => b.alias.length - a.alias.length);

  const chunks = text
    .split(/[\n,;]+|\s+(?:and|plus|&)\s+/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  const qty = new Map<string, number>();
  const order: string[] = [];
  const unmatched: Unmatched[] = [];

  for (const raw of chunks) {
    const chunk = normalise(raw);
    const hits = new Map<string, CatalogItem>();
    for (const { alias, item } of aliases) {
      const re = new RegExp(`(^|[^a-z0-9])${escapeRe(alias)}(?:e?s)?($|[^a-z0-9])`);
      if (re.test(chunk)) hits.set(item.item_key, item);
    }
    if (hits.size === 0) {
      unmatched.push({ text: raw, reason: 'no catalogue item matches' });
      continue;
    }
    if (hits.size > 1) {
      unmatched.push({
        text: raw,
        reason: `mentions several items (${[...hits.keys()].join(', ')}); list them separately`,
      });
      continue;
    }
    const item = [...hits.values()][0]!;
    let n = multiplier(chunk) ?? 1;
    if (item.unit.includes('tb')) {
      const tb = /(\d+)\s*tb\b/.exec(chunk);
      if (tb)
        n =
          (multiplier(chunk.replace(/^(\d+)\s*tb\b/, '').trim()) ?? 1) *
          Number.parseInt(tb[1]!, 10);
    }
    if (!Number.isInteger(n) || n < 1 || n > MAX_QTY) {
      unmatched.push({ text: raw, reason: `quantity must be between 1 and ${MAX_QTY}` });
      continue;
    }
    if (!qty.has(item.item_key)) order.push(item.item_key);
    qty.set(item.item_key, (qty.get(item.item_key) ?? 0) + n);
  }

  const items: ItemRequest[] = [];
  for (const key of order) {
    const n = qty.get(key)!;
    if (n > MAX_QTY)
      unmatched.push({ text: key, reason: `total quantity ${n} is over ${MAX_QTY}` });
    else items.push({ item_key: key, qty: n });
  }
  return { items, unmatched };
}
