/**
 * Agents service contract as the web app consumes it (PRD §10.2 records, §11.5 endpoints and SSE events).
 * Event names and the {seq, ts, type, data} envelope are frozen in the PRD; the per-event `data` shapes below
 * are the web app's reading of §10.2 until David's Zod types land in packages/shared (H2). When they do,
 * this file re-exports them and the reducer is the only place that changes.
 */
export type Level = "ALLOW" | "REVIEW" | "BLOCK";

export interface CatalogItem {
  item_key: string;
  title: string;
  unit: string;
  min_spec: Record<string, number | string>;
  aliases?: string[];
}

export interface Offer {
  offer_id: string;
  item_key: string;
  seller_name: string;
  vendor_id: string;
  vendor_display?: string;
  product_title: string;
  product_fingerprint: string;
  spec: Record<string, number | string>;
  quantity: number;
  unit: string;
  price_total_micro_usd: number;
  fees_micro_usd: number;
  currency: string;
  source_url: string;
  captured_at: string;
  capture_method: "manual" | "script";
  raw_text: string;
  notes: string;
  fixture?: boolean;
}

export interface Finding {
  rule_id: string;
  level: Level;
  message: string;
  inputs?: { median_micro?: number; ratio_bps?: number; count?: number };
}

export interface Verdict {
  offer_id: string;
  level: Level;
  findings: Finding[];
  assessed_at: string;
  rules_hash: string;
}

export interface ParsedItem {
  item_key: string;
  title: string;
  qty: number;
  source_text: string;
}

export interface BasketLine {
  item_key: string;
  offer_id: string;
  vendor_id: string;
  qty: number;
  amount: string;
}

export interface BasketDraft {
  basket_id: string;
  request_id: string;
  owner_id: string;
  token_id: string;
  lines: BasketLine[];
  payouts: { vendor_id: string; amount: string; line_count: number }[];
  total: string;
  evidence_hash: string;
}

export interface SignedBasket {
  payload_b64: string;
  hash_hex: string;
  signature_b64: string;
  guard_key_version: number;
  expires_at_ms: string;
}

export interface EventData {
  "request.created": { request_id: string; owner_id: string; text: string; constraints: Constraints };
  "research.parsed": { items: ParsedItem[] };
  "research.unmatched": { text: string[] };
  "research.offer": { offer: Offer };
  "policy.verdict": { verdict: Verdict; median_micro: number; ratio_bps: number };
  "coordinator.basket": { basket: BasketDraft };
  "coordinator.needs_ack": { offer_ids: string[]; reasons: Record<string, string> };
  "guard.signed": { signed: SignedBasket; mock?: boolean };
  "guard.refused": { code: string; findings: Finding[] };
  "approval.waiting": { hash_hex: string; expires_at_ms: string };
  "approval.seen": { hash_hex: string; tx_hash?: string };
  "approval.expired": { hash_hex: string };
  "settlement.submitted": { tx_hash: string };
  "settlement.payout": { vendor_id: string; amount: string; status: "settled" | "failed"; tx_hash: string; reason?: string };
  "settlement.final": { status: "Completed" | "PartiallyPaid" | "Failed" };
  "explain.verdict": { offer_id: string; text: string };
  "explain.basket": { text: string };
  error: { code: string; message: string; recoverable: boolean };
}

export type EventType = keyof EventData;
export const EVENT_TYPES = [
  "request.created", "research.parsed", "research.unmatched", "research.offer", "policy.verdict", "coordinator.basket",
  "coordinator.needs_ack", "guard.signed", "guard.refused", "approval.waiting", "approval.seen", "approval.expired",
  "settlement.submitted", "settlement.payout", "settlement.final", "explain.verdict", "explain.basket", "error",
] as const satisfies readonly EventType[];

export type AgentEvent = { [K in EventType]: { seq: number; ts: string; type: K; data: EventData[K] } }[EventType];

export interface Constraints {
  max_total?: string;
  preferred_vendors?: string[];
}

export interface AgentsClient {
  readonly mode: "live" | "mock";
  catalog(): Promise<CatalogItem[]>;
  createRequest(input: { owner_id: string; text: string; constraints: Constraints }): Promise<{ request_id: string }>;
  subscribe(id: string, onEvent: (e: AgentEvent) => void, onError?: (msg: string) => void): () => void;
  acknowledge(id: string, offerIds: string[]): Promise<void>;
  cancel(id: string): Promise<void>;
  /** Mock only: stands in for the Settlement Agent seeing an on-chain approval. */
  simulateApproval?(id: string): Promise<void>;
}
