import type { AgentEvent, BasketDraft, Constraints, EventData, Offer, ParsedItem, SignedBasket, Verdict } from "./types";

/**
 * Everything on the request page derives from the event list, so a refresh (full replay) renders the
 * same page, and "what happened when" is never stored twice.
 */
export type Stage = "parsing" | "researching" | "assessing" | "needs_ack" | "signing" | "awaiting_approval" | "executing" | "final" | "refused" | "expired" | "error";

export type LaneKey = "research" | "guard" | "coordinator" | "approval" | "settlement";
export interface Lane {
  status: "idle" | "active" | "done" | "failed";
  at?: string;
  detail?: string;
}

export interface RequestView {
  id: string;
  text: string;
  owner: string;
  constraints: Constraints;
  stage: Stage;
  items: ParsedItem[];
  unmatched: string[];
  offers: Record<string, Offer>;
  order: string[];
  verdicts: Record<string, Verdict>;
  medians: Record<string, number>;
  ratios: Record<string, number>;
  explanations: Record<string, string>;
  basket?: BasketDraft;
  basketNote?: string;
  needsAck: { offer_ids: string[]; reasons: Record<string, string> } | null;
  signed?: SignedBasket;
  signedMock: boolean;
  refused?: EventData["guard.refused"];
  approval: { status: "none" | "waiting" | "seen" | "expired"; tx?: string };
  submittedTx?: string;
  payouts: EventData["settlement.payout"][];
  final?: EventData["settlement.final"]["status"];
  errors: EventData["error"][];
  lanes: Record<LaneKey, Lane>;
  lastSeq: number;
  log: AgentEvent[];
}

export const initialView = (id: string): RequestView => ({
  id,
  text: "",
  owner: "",
  constraints: {},
  stage: "parsing",
  items: [],
  unmatched: [],
  offers: {},
  order: [],
  verdicts: {},
  medians: {},
  ratios: {},
  explanations: {},
  needsAck: null,
  signedMock: false,
  approval: { status: "none" },
  payouts: [],
  errors: [],
  lanes: { research: { status: "active" }, guard: { status: "idle" }, coordinator: { status: "idle" }, approval: { status: "idle" }, settlement: { status: "idle" } },
  lastSeq: 0,
  log: [],
});

export function reduce(s: RequestView, e: AgentEvent): RequestView {
  if (e.seq <= s.lastSeq) return s;
  const v: RequestView = { ...s, lastSeq: e.seq, log: [...s.log, e], lanes: { ...s.lanes } };
  const lane = (k: LaneKey, l: Lane) => (v.lanes[k] = { ...v.lanes[k], ...l });
  switch (e.type) {
    case "request.created":
      v.text = e.data.text;
      v.owner = e.data.owner_id;
      v.constraints = e.data.constraints;
      lane("research", { status: "active", at: e.ts, detail: "parsing your list" });
      break;
    case "research.parsed":
      v.items = e.data.items;
      v.stage = "researching";
      lane("research", { status: "active", at: e.ts, detail: `${e.data.items.length} items matched` });
      break;
    case "research.unmatched":
      v.unmatched = e.data.text;
      break;
    case "research.offer":
      if (!v.offers[e.data.offer.offer_id]) v.order = [...v.order, e.data.offer.offer_id];
      v.offers = { ...v.offers, [e.data.offer.offer_id]: e.data.offer };
      lane("research", { status: "active", at: e.ts, detail: `${v.order.length} offers found` });
      break;
    case "policy.verdict": {
      const ik = v.offers[e.data.verdict.offer_id]?.item_key;
      v.verdicts = { ...v.verdicts, [e.data.verdict.offer_id]: e.data.verdict };
      if (ik) v.medians = { ...v.medians, [ik]: e.data.median_micro };
      v.ratios = { ...v.ratios, [e.data.verdict.offer_id]: e.data.ratio_bps };
      v.stage = "assessing";
      lane("research", { status: "done", detail: `${v.order.length} offers` });
      const vs = Object.values(v.verdicts);
      lane("guard", { status: "active", at: e.ts, detail: `${vs.filter((x) => x.level === "BLOCK").length} blocked · ${vs.filter((x) => x.level === "REVIEW").length} flagged` });
      break;
    }
    case "explain.verdict":
      v.explanations = { ...v.explanations, [e.data.offer_id]: e.data.text };
      break;
    case "explain.basket":
      v.basketNote = e.data.text;
      break;
    case "coordinator.basket":
      v.basket = e.data.basket;
      v.signed = undefined;
      v.needsAck = null;
      v.stage = "signing";
      lane("guard", { status: "done" });
      lane("coordinator", { status: "done", at: e.ts, detail: `${e.data.basket.payouts.length} vendors · ${e.data.basket.lines.length} lines` });
      break;
    case "coordinator.needs_ack":
      v.needsAck = e.data;
      v.stage = "needs_ack";
      lane("approval", { status: "active", at: e.ts, detail: "needs your review" });
      break;
    case "guard.signed":
      v.signed = e.data.signed;
      v.signedMock = !!e.data.mock;
      v.needsAck = null;
      lane("guard", { status: "done", at: e.ts, detail: `signed · key v${e.data.signed.guard_key_version}` });
      break;
    case "guard.refused":
      v.refused = e.data;
      v.stage = "refused";
      lane("guard", { status: "failed", at: e.ts, detail: e.data.code });
      break;
    case "approval.waiting":
      v.approval = { status: "waiting" };
      v.stage = "awaiting_approval";
      lane("approval", { status: "active", at: e.ts, detail: "waiting for your wallet" });
      break;
    case "approval.seen":
      v.approval = { status: "seen", tx: e.data.tx_hash };
      v.stage = "executing";
      lane("approval", { status: "done", at: e.ts, detail: "approved on-chain" });
      lane("settlement", { status: "active", at: e.ts, detail: "submitting" });
      break;
    case "approval.expired":
      v.approval = { status: "expired" };
      v.stage = "expired";
      lane("approval", { status: "failed", at: e.ts, detail: "expired" });
      break;
    case "settlement.submitted":
      v.submittedTx = e.data.tx_hash;
      lane("settlement", { status: "active", at: e.ts, detail: "execute_basket sent" });
      break;
    case "settlement.payout":
      v.payouts = [...v.payouts.filter((p) => p.vendor_id !== e.data.vendor_id), e.data];
      lane("settlement", { status: "active", at: e.ts, detail: `${v.payouts.length} of ${v.basket?.payouts.length ?? "?"} payouts` });
      break;
    case "settlement.final":
      v.final = e.data.status;
      v.stage = "final";
      lane("settlement", { status: e.data.status === "Failed" ? "failed" : "done", at: e.ts, detail: e.data.status });
      break;
    case "error":
      v.errors = [...v.errors, e.data];
      if (!e.data.recoverable) v.stage = "error";
      break;
  }
  return v;
}
