import type { VerdictLevel } from "@/components/verdict-badge";

/**
 * Illustration data for the landing page, copied from data/snapshot (v0, captured 5 Nov 2026) and the
 * expected verdicts in data/snapshot/sources.md. Live screens read from the agents service and chain instead.
 */
export interface DemoOffer {
  seller: string;
  vendor: string;
  priceMicro: number;
  bps: number;
  level: VerdictLevel;
  rule: string;
  note: string;
}

export const STORAGE_OFFERS: DemoOffer[] = [
  { seller: "Backblaze", vendor: "vendor-06", priceMicro: 6_950_000, bps: 8698, level: "ALLOW", rule: "R-08", note: "Within 50–105% of median" },
  { seller: "Hetzner", vendor: "vendor-04", priceMicro: 7_284_376, bps: 9116, level: "ALLOW", rule: "R-08", note: "€6.49 at ECB 1.1224" },
  { seller: "Wasabi", vendor: "vendor-02", priceMicro: 7_990_000, bps: 10000, level: "ALLOW", rule: "R-08", note: "Sets the median" },
  { seller: "Cloudflare R2", vendor: "vendor-03", priceMicro: 15_000_000, bps: 18773, level: "BLOCK", rule: "R-05", note: "Over 120% of median" },
  { seller: "DigitalOcean Spaces", vendor: "vendor-01", priceMicro: 20_000_000, bps: 25031, level: "BLOCK", rule: "R-05", note: "Over 120% of median" },
];

export const VPS_OFFERS: DemoOffer[] = [
  { seller: "OVHcloud", vendor: "vendor-06", priceMicro: 4_540_000, bps: 1891, level: "REVIEW", rule: "R-07", note: "Under 50% of median" },
  { seller: "Hetzner", vendor: "vendor-04", priceMicro: 6_723_176, bps: 2801, level: "REVIEW", rule: "R-07", note: "Under 50% of median" },
  { seller: "AWS Lightsail", vendor: "vendor-02", priceMicro: 24_000_000, bps: 10000, level: "ALLOW", rule: "R-08", note: "Chosen: fewer vendors" },
  { seller: "Akamai", vendor: "vendor-04", priceMicro: 24_000_000, bps: 10000, level: "ALLOW", rule: "R-08", note: "Tie at $24.00" },
  { seller: "DigitalOcean", vendor: "vendor-01", priceMicro: 24_000_000, bps: 10000, level: "ALLOW", rule: "R-08", note: "Tie at $24.00" },
];

export const DEMO_PAYOUTS = [
  { vendor: "vendor-02", standIn: "AWS Lightsail ×2, Gandi", amount: 59_710_000n, lines: 2, status: "paid" as const },
  { vendor: "vendor-03", standIn: "Mailgun", amount: 15_000_000n, lines: 1, status: "paid" as const },
  { vendor: "vendor-06", standIn: "Backblaze", amount: 6_950_000n, lines: 1, status: "refunded" as const },
];
export const DEMO_TOTAL = 81_660_000n;
/** Illustrative only: the real hash comes from Guard's Borsh payload. */
export const DEMO_HASH = "9f3a61c0b7e24d58a1c39f07e2b64d1a5c8e0f3b27d9a46e1c5b80f2d7a3c21e";
