import {
  DEFAULT_RULES_CONFIG,
  rulesHashHex,
  type CatalogItem,
  type Offer,
} from '@checkpoint/shared';
import { loadSnapshotOrThrow } from '@checkpoint/shared/node';
import { describe, expect, it } from 'vitest';
import {
  assessBasket,
  assessOffers,
  medianMicro,
  UnknownOfferError,
  type BasketRuleInput,
} from '../src/rules';

const NOW = Date.parse('2026-11-06T00:00:00Z');
const RULES_HASH = rulesHashHex(DEFAULT_RULES_CONFIG);
const ALLOWED = ['v1.test', 'v2.test', 'v3.test', 'v4.test', 'v6.test'];

const ITEM: CatalogItem = {
  item_key: 'widget',
  title: 'Widget',
  unit: 'widget-month',
  min_spec: { vcpu: 2 },
  aliases: ['widget'],
};

let n = 0;
function offer(price: number, over: Partial<Offer> = {}): Offer {
  n += 1;
  return {
    offer_id: `o${n}`,
    item_key: 'widget',
    vendor_id: 'v1.test',
    seller_name: `Seller ${n}`,
    product_title: `Product ${n}`,
    product_fingerprint: `fp-${n}`,
    spec: { vcpu: 2 },
    quantity: 1,
    unit: 'widget-month',
    price_total_micro_usd: price,
    fees_micro_usd: 0,
    currency: 'USD',
    source_url: 'https://example.com/x',
    captured_at: '2026-11-05T10:00:00Z',
    capture_method: 'fixture',
    ...over,
  };
}

function assess(offers: Offer[], ids = offers.map((o) => o.offer_id)) {
  return assessOffers({
    offers,
    catalog: [ITEM],
    offerIds: ids,
    config: DEFAULT_RULES_CONFIG,
    rulesHash: RULES_HASH,
    allowedVendors: ALLOWED,
    nowMs: NOW,
  });
}

/** Anchors keep the median at exactly 1_000_000 µUSD whatever the tested price. */
function withAnchors(price: number) {
  const t = offer(price);
  const anchors = [offer(1_000_000), offer(1_000_000), offer(1_000_000), offer(900_000)];
  const res = assess([t, ...anchors], [t.offer_id]);
  expect(res.medians.widget).toBe('1000000');
  return res.verdicts[0]!;
}

const ruleIds = (v: { findings: { rule_id: string }[] }) => v.findings.map((f) => f.rule_id);

describe('AT-02 price boundaries (integer bps, PRD §9.2)', () => {
  it.each([
    [500_000, 5000, 'ALLOW', 'R-08'],
    [499_900, 4999, 'REVIEW', 'R-07'],
    [1_050_000, 10500, 'ALLOW', 'R-08'],
    [1_050_100, 10501, 'REVIEW', 'R-06'],
    [1_200_000, 12000, 'REVIEW', 'R-06'],
    [1_200_100, 12001, 'BLOCK', 'R-05'],
  ])('price %i → ratio %i bps → %s (%s)', (price, bps, level, rule) => {
    const v = withAnchors(price);
    expect(v.ratio_bps).toBe(bps);
    expect(v.level).toBe(level);
    expect(ruleIds(v)).toContain(rule);
  });

  it('floors the ratio (never rounds up across a boundary)', () => {
    const v = withAnchors(1_050_099); // 10500.99 bps → 10500
    expect(v.ratio_bps).toBe(10500);
    expect(v.level).toBe('ALLOW');
  });
});

describe('R-03 INSUFFICIENT_DATA', () => {
  it('2 valid offers → every offer of the item gets REVIEW', () => {
    const res = assess([offer(1_000_000), offer(1_000_000)]);
    for (const v of res.verdicts) {
      expect(ruleIds(v)).toContain('R-03');
      expect(v.level).toBe('REVIEW');
    }
  });

  it('3 valid offers → no R-03', () => {
    const res = assess([offer(1_000_000), offer(1_000_000), offer(1_000_000)]);
    for (const v of res.verdicts) expect(ruleIds(v)).not.toContain('R-03');
  });

  it('invalid and duplicate offers do not count toward the 3', () => {
    const a = offer(1_000_000, { seller_name: 'S', product_fingerprint: 'same' });
    const dup = offer(1_100_000, { seller_name: 'S', product_fingerprint: 'same' });
    const bad = offer(1_000_000, { currency: 'EUR' });
    const res = assess([a, dup, bad, offer(1_000_000)]);
    expect(ruleIds(res.verdicts[0]!)).toContain('R-03');
  });
});

describe('median (PRD §9.1)', () => {
  it('even count: floored mean of the two middle values', () => {
    expect(medianMicro([1n, 2n, 4n, 9n])).toBe(3n);
    expect(medianMicro([5_990_000n, 6_000_000n])).toBe(5_995_000n);
  });
  it('odd count: the middle value', () => {
    expect(medianMicro([3n, 1n, 2n])).toBe(2n);
  });
  it('normalises by quantity, floored', () => {
    const multi = offer(3_000_001, { quantity: 3 });
    const res = assess([multi, offer(1_000_000), offer(1_000_000)]);
    expect(res.verdicts[0]!.unit_price_micro).toBe('1000000');
  });
});

describe('R-01 DATA_INVALID', () => {
  it.each([
    ['missing seller', { seller_name: '' }],
    ['missing source URL', { source_url: undefined }],
    ['invalid source URL', { source_url: 'javascript:alert(1)' }],
    ['missing capture timestamp', { captured_at: undefined }],
    ['future timestamp', { captured_at: '2027-01-01T00:00:00Z' }],
    ['missing price', { price_total_micro_usd: undefined }],
    ['zero price', { price_total_micro_usd: 0 }],
    ['non-USD', { currency: 'EUR' }],
    ['zero quantity', { quantity: 0 }],
  ])('%s → BLOCK and excluded from the median', (_name, over) => {
    const bad = offer(50_000_000, over as Partial<Offer>);
    const res = assess([bad, offer(1_000_000), offer(1_000_000), offer(1_000_000)]);
    const v = res.verdicts[0]!;
    expect(v.level).toBe('BLOCK');
    expect(ruleIds(v)).toContain('R-01');
    expect(res.medians.widget).toBe('1000000');
  });
});

describe('R-02 STALE', () => {
  it('older than max_age_hours → REVIEW; exactly at the limit → fine', () => {
    const limitMs = DEFAULT_RULES_CONFIG.max_age_hours * 3_600_000;
    const stale = offer(1_000_000, { captured_at: new Date(NOW - limitMs - 1000).toISOString() });
    const edge = offer(1_000_000, { captured_at: new Date(NOW - limitMs).toISOString() });
    const res = assess([stale, edge, offer(1_000_000)]);
    expect(ruleIds(res.verdicts[0]!)).toContain('R-02');
    expect(res.verdicts[0]!.level).toBe('REVIEW');
    expect(ruleIds(res.verdicts[1]!)).not.toContain('R-02');
  });

  it('uses the injected clock, not the wall clock (pure)', () => {
    const o = [offer(1_000_000), offer(1_000_000), offer(1_000_000)];
    const later = assessOffers({
      offers: o,
      catalog: [ITEM],
      offerIds: [o[0]!.offer_id],
      config: DEFAULT_RULES_CONFIG,
      rulesHash: RULES_HASH,
      allowedVendors: ALLOWED,
      nowMs: NOW + 400 * 24 * 3_600_000,
    });
    expect(ruleIds(later.verdicts[0]!)).toContain('R-02');
  });
});

describe('R-04, R-09, R-10', () => {
  it('R-04: vendor not on the allowlist → BLOCK, even when the price is good', () => {
    const v = assess([
      offer(1_000_000, { vendor_id: 'v5.test' }),
      offer(1_000_000),
      offer(1_000_000),
    ]).verdicts[0]!;
    expect(v.level).toBe('BLOCK');
    expect(ruleIds(v)).toEqual(expect.arrayContaining(['R-08', 'R-04']));
  });

  it('R-09: duplicates keep the lowest price; the rest are blocked and excluded from the median', () => {
    const low = offer(1_000_000, { seller_name: 'Same Seller', product_fingerprint: 'SKU-1' });
    const high = offer(9_000_000, { seller_name: 'same seller ', product_fingerprint: 'sku-1' });
    const res = assess([low, high, offer(1_000_000), offer(1_000_000)]);
    expect(res.verdicts[0]!.level).toBe('ALLOW');
    expect(res.verdicts[1]!.level).toBe('BLOCK');
    expect(ruleIds(res.verdicts[1]!)).toEqual(['R-09']);
    expect(res.medians.widget).toBe('1000000');
  });

  it('R-10: below minimum spec → BLOCK and excluded from the median', () => {
    const small = offer(100_000, { spec: { vcpu: 1 } });
    const res = assess([small, offer(1_000_000), offer(1_000_000), offer(1_000_000)]);
    expect(res.verdicts[0]!.level).toBe('BLOCK');
    expect(ruleIds(res.verdicts[0]!)).toEqual(['R-10']);
    expect(res.medians.widget).toBe('1000000');
  });
});

describe('assessOffers', () => {
  it('rejects unknown offer IDs', () => {
    expect(() => assess([offer(1)], ['nope'])).toThrow(UnknownOfferError);
  });

  it('is deterministic: same input → same output', () => {
    const o = [offer(1_000_000), offer(1_210_000), offer(400_000), offer(1_000_000)];
    expect(assess(o)).toEqual(assess(o));
  });

  it('every verdict carries rule_id, level, message, inputs and the rules hash (FR-R03)', () => {
    const res = assess([offer(1_000_000), offer(1_000_000), offer(1_000_000)]);
    const v = res.verdicts[0]!;
    expect(v.rules_hash).toBe(RULES_HASH);
    expect(v.findings[0]).toMatchObject({ rule_id: 'R-08', name: 'PRICE_GOOD', level: 'ALLOW' });
    expect(v.findings[0]!.inputs).toMatchObject({
      median_micro: '1000000',
      ratio_bps: 10000,
      count: 3,
    });
  });
});

describe('dev fixture snapshot (the demo storyline)', () => {
  const snap = loadSnapshotOrThrow(
    new URL('../../../data/fixtures/dev-snapshot', import.meta.url).pathname,
  );
  const res = assessOffers({
    offers: snap.offers,
    catalog: snap.catalog,
    offerIds: snap.offers.map((o) => o.offer_id),
    config: DEFAULT_RULES_CONFIG,
    rulesHash: RULES_HASH,
    allowedVendors: ['01', '02', '03', '04', '06'].map((x) => `vendor-${x}.cpdemo.testnet`),
    nowMs: NOW,
  });
  const v = Object.fromEntries(res.verdicts.map((x) => [x.offer_id, x]));

  it.each([
    ['vps-b', 'ALLOW'],
    ['vps-d', 'BLOCK'], // overpriced (133%)
    ['vps-e', 'BLOCK'], // vendor-05 not allowlisted
    ['vps-dup', 'BLOCK'], // duplicate of vps-a
    ['vps-small', 'BLOCK'], // spec mismatch
    ['dom-f', 'ALLOW'], // vendor-06: allowlisted, not registered on cpUSD (AT-10)
    ['dom-c', 'REVIEW'], // 118%
    ['sto-b', 'REVIEW'], // unusually low
    ['sto-d', 'ALLOW'],
    ['eml-inject', 'BLOCK'], // injected text changes nothing: vendor-05 + low price
    ['eml-stale', 'REVIEW'],
    ['eml-bad', 'BLOCK'], // missing source URL
  ])('%s → %s', (id, level) => {
    expect(v[id]!.level).toBe(level);
  });

  it('medians match the hand calculation', () => {
    expect(res.medians).toEqual({
      'vps-2c4g-month': '12000000',
      'domain-com-year': '11000000',
      'storage-1tb-month': '5995000',
      'email-10k-month': '14500000',
    });
  });
});

describe('basket rules R-20 to R-24', () => {
  const base: BasketRuleInput = {
    token_id: 'cpusd.test',
    total: 100_000_000n,
    vendor_count: 2,
    lines: [{ offer_id: 'a', level: 'ALLOW' }],
    acknowledged_offer_ids: new Set(),
    vault: {
      tokens: ['cpusd.test'],
      effective_max_basket: 500_000_000n,
      effective_daily_cap: 1_000_000_000n,
      spent_today: 0n,
      max_vendors: 4,
      available: 1_000_000_000n,
    },
  };
  const ids = (b: Partial<BasketRuleInput>, vault: Partial<BasketRuleInput['vault']> = {}) =>
    assessBasket({ ...base, ...b, vault: { ...base.vault, ...vault } }).map((f) => f.rule_id);

  it('a good basket passes', () => expect(ids({})).toEqual([]));
  it('R-20 over the basket cap (cap itself is fine)', () => {
    expect(ids({ total: 500_000_000n })).toEqual([]);
    expect(ids({ total: 500_000_001n })).toEqual(['R-20']);
  });
  it('R-21 over the daily cap including today’s spend', () => {
    expect(ids({}, { spent_today: 900_000_000n })).toEqual([]);
    expect(ids({}, { spent_today: 900_000_001n })).toEqual(['R-21']);
  });
  it('R-22 too many vendors', () => expect(ids({ vendor_count: 5 })).toEqual(['R-22']));
  it('R-23 token not allowlisted or balance too low', () => {
    expect(ids({ token_id: 'fake.test' })).toEqual(['R-23']);
    expect(ids({}, { available: 99_999_999n })).toEqual(['R-23']);
  });
  it('R-24 unacknowledged REVIEW line; acknowledged is fine', () => {
    const lines = [{ offer_id: 'r', level: 'REVIEW' as const }];
    expect(ids({ lines })).toEqual(['R-24']);
    expect(ids({ lines, acknowledged_offer_ids: new Set(['r']) })).toEqual([]);
  });
});
