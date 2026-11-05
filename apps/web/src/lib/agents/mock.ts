import catalogJson from "../../../../../data/snapshot/catalog.json";
import fixturesJson from "../../../../../data/snapshot/fixtures/adversarial.json";
import offersJson from "../../../../../data/snapshot/offers.json";
import { config } from "../config";
import { basketHash, bytesToB64, canonicalJson, encodePayload, sha256Hex, type BasketPayloadV1 } from "../payload";
import type { AgentEvent, AgentsClient, BasketDraft, CatalogItem, Constraints, EventData, EventType, Finding, Level, Offer, ParsedItem, Verdict } from "./types";

/**
 * In-browser stand-in for the agents service (NEXT_PUBLIC_USE_MOCK=1), so the desk works before H2/H6.
 * It runs the same pipeline the PRD describes over the real snapshot plus the adversarial fixtures:
 * deterministic parse → research.offer per offer → rules (R-03..R-10, §9) → Coordinator (§7.3 step 5) →
 * a real Borsh payload and hash (so the browser's hash check is genuine) → approval wait.
 * What it can't do is sign with Guard's key or touch the chain: the signature is random bytes and approval
 * is simulated, and the UI labels both. Events are stored with due times in localStorage, so a refresh
 * replays the history and the run carries on where it was, like the real SSE stream with Last-Event-ID.
 */

const CATALOG = catalogJson.items as unknown as CatalogItem[];
const OFFERS = [...(offersJson.offers as unknown as Offer[]), ...(fixturesJson.offers as unknown as Offer[])];
const ALLOWLIST = new Set([1, 2, 3, 4, 6].map((n) => `vendor-0${n}.cpdemo.testnet`));
const RULES = { version: 1, min_offers: 3, max_age_hours: 168, bps: { good_max: 10500, fair_max: 12000, low_min: 5000 }, currency: "USD" };
const RULES_HASH = sha256Hex(canonicalJson(RULES));
const KEY = "cp-mock-runs";

interface Stored {
  seq: number;
  due: number;
  type: EventType;
  data: unknown;
}
interface Run {
  id: string;
  created: number;
  events: Stored[];
  needsAck: string[];
  pending?: { items: ParsedItem[]; verdicts: Verdict[]; owner: string; text: string; constraints: Constraints };
}

const load = (): Record<string, Run> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
};
const save = (all: Record<string, Run>) => localStorage.setItem(KEY, JSON.stringify(all, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
const bus = new EventTarget();

function push(run: Run, at: number, type: EventType, data: unknown) {
  run.events.push({ seq: run.events.length + 1, due: at, type, data });
}

// ── deterministic parser: one line or comma-separated phrase per item ──
function parse(text: string): { items: ParsedItem[]; unmatched: string[] } {
  const items: ParsedItem[] = [];
  const unmatched: string[] = [];
  for (const raw of text.split(/\n|,|;/).map((s) => s.trim()).filter(Boolean)) {
    const line = raw.toLowerCase();
    const hit = CATALOG.find((c) => (c.aliases ?? []).some((a) => line.includes(a.toLowerCase())) || line.includes(c.title.toLowerCase()));
    if (!hit) {
      unmatched.push(raw);
      continue;
    }
    const m = /^(\d+)\s*(?:×|x)\s*/i.exec(raw);
    items.push({ item_key: hit.item_key, title: hit.title, qty: m ? Math.max(1, Number(m[1])) : 1, source_text: raw });
  }
  return { items, unmatched };
}

// ── rules (PRD §9), integer only ──
function specOk(o: Offer) {
  const ms = CATALOG.find((c) => c.item_key === o.item_key)?.min_spec ?? {};
  return Object.entries(ms).every(([k, v]) => {
    const got = o.spec[k];
    if (got === undefined) return false;
    return typeof v === "string" ? got === v : Number(got) >= v;
  });
}

function assess(itemKey: string): { verdicts: Verdict[]; median: number; ratios: Record<string, number> } {
  const os = OFFERS.filter((o) => o.item_key === itemKey);
  const price = (o: Offer) => Math.floor((o.price_total_micro_usd + o.fees_micro_usd) / o.quantity);
  const seen = new Map<string, string>();
  const dup = new Set<string>();
  for (const o of [...os].sort((a, b) => price(a) - price(b))) {
    const k = `${o.seller_name}|${o.product_fingerprint}`;
    if (seen.has(k)) dup.add(o.offer_id);
    else seen.set(k, o.offer_id);
  }
  const valid = os.filter((o) => specOk(o) && !dup.has(o.offer_id));
  const vals = valid.map(price).sort((a, b) => a - b);
  const n = vals.length;
  const median = n % 2 ? vals[(n - 1) / 2]! : Math.floor((vals[n / 2 - 1]! + vals[n / 2]!) / 2);
  const ratios: Record<string, number> = {};
  const now = new Date().toISOString();
  const verdicts = os.map((o) => {
    const r = Math.floor((price(o) * 10000) / median);
    ratios[o.offer_id] = r;
    const f: Finding[] = [];
    const inputs = { median_micro: median, ratio_bps: r };
    if (valid.length < RULES.min_offers) f.push({ rule_id: "R-03", level: "REVIEW", message: `Only ${valid.length} comparable offers`, inputs: { count: valid.length } });
    if (!ALLOWLIST.has(o.vendor_id)) f.push({ rule_id: "R-04", level: "BLOCK", message: `${o.vendor_id.split(".")[0]} is not on the Vault allowlist` });
    if (dup.has(o.offer_id)) f.push({ rule_id: "R-09", level: "BLOCK", message: "Duplicate listing from the same seller; the cheaper copy is kept" });
    if (!specOk(o)) f.push({ rule_id: "R-10", level: "BLOCK", message: "Spec is below the item's minimum" });
    if (r > RULES.bps.fair_max) f.push({ rule_id: "R-05", level: "BLOCK", message: `${(r / 100).toFixed(1)}% of median, over the 120% limit`, inputs });
    else if (r > RULES.bps.good_max) f.push({ rule_id: "R-06", level: "REVIEW", message: `${(r / 100).toFixed(1)}% of median, between 105% and 120%`, inputs });
    else if (r < RULES.bps.low_min) f.push({ rule_id: "R-07", level: "REVIEW", message: `${(r / 100).toFixed(1)}% of median, unusually low`, inputs });
    else f.push({ rule_id: "R-08", level: "ALLOW", message: `${(r / 100).toFixed(1)}% of median`, inputs });
    const level: Level = f.some((x) => x.level === "BLOCK") ? "BLOCK" : f.some((x) => x.level === "REVIEW") ? "REVIEW" : "ALLOW";
    return { offer_id: o.offer_id, level, findings: f, assessed_at: now, rules_hash: RULES_HASH };
  });
  return { verdicts, median, ratios };
}

// ── Coordinator (§7.3 step 5, FR-AG05 tie-breakers) ──
function coordinate(items: ParsedItem[], verdicts: Verdict[], acked: Set<string>, prefer: string[]) {
  const vmap = new Map(verdicts.map((v) => [v.offer_id, v]));
  const price = (o: Offer) => Math.floor((o.price_total_micro_usd + o.fees_micro_usd) / o.quantity);
  const picks: { item: ParsedItem; offer: Offer; review: boolean }[] = [];
  const vendors = new Set<string>();
  const ordered = [...items].sort((a, b) => a.item_key.localeCompare(b.item_key));
  for (const item of ordered) {
    const pool = OFFERS.filter((o) => o.item_key === item.item_key && ALLOWLIST.has(o.vendor_id));
    const allow = pool.filter((o) => vmap.get(o.offer_id)?.level === "ALLOW");
    const review = pool.filter((o) => vmap.get(o.offer_id)?.level === "REVIEW");
    const cand = allow.length ? allow : review;
    if (!cand.length) continue;
    const best = Math.min(...cand.map(price));
    const tied = cand.filter((o) => price(o) === best).sort(
      (a, b) =>
        Number(prefer.includes(b.vendor_id)) - Number(prefer.includes(a.vendor_id)) ||
        Number(vendors.has(b.vendor_id)) - Number(vendors.has(a.vendor_id)) ||
        a.offer_id.localeCompare(b.offer_id),
    );
    const offer = tied[0]!;
    vendors.add(offer.vendor_id);
    picks.push({ item, offer, review: !allow.length && !acked.has(offer.offer_id) });
  }
  return picks;
}

function buildBasket(id: string, owner: string, text: string, constraints: Constraints, picks: ReturnType<typeof coordinate>, verdicts: Verdict[]) {
  const lines = picks.map(({ item, offer }) => ({
    item_key: item.item_key,
    offer_id: offer.offer_id,
    vendor_id: offer.vendor_id,
    qty: item.qty,
    amount: (BigInt(offer.price_total_micro_usd + offer.fees_micro_usd) * BigInt(item.qty)).toString(),
  }));
  const byVendor = new Map<string, { amount: bigint; line_count: number }>();
  for (const l of lines) {
    const v = byVendor.get(l.vendor_id) ?? { amount: 0n, line_count: 0 };
    v.amount += BigInt(l.amount);
    v.line_count += 1;
    byVendor.set(l.vendor_id, v);
  }
  const payouts = [...byVendor.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([vendor_id, v]) => ({ vendor_id, amount: v.amount.toString(), line_count: v.line_count }));
  const total = payouts.reduce((s, p) => s + BigInt(p.amount), 0n).toString();
  const basket_id = crypto.randomUUID();
  const evidence_hash = sha256Hex(canonicalJson({ request: { id, owner, text, constraints }, offers: picks.map((p) => p.offer), verdicts, lines, rules_hash: RULES_HASH }));
  const draft: BasketDraft = { basket_id, request_id: id, owner_id: owner, token_id: config.tokenId, lines, payouts, total, evidence_hash };
  return draft;
}

function sign(draft: BasketDraft) {
  const now = BigInt(Date.now());
  const nonce = new DataView(crypto.getRandomValues(new Uint8Array(8)).buffer).getBigUint64(0);
  const hexToBytes = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
  const payload: BasketPayloadV1 = {
    schema_version: 1,
    network_id: config.network,
    vault_id: config.vaultId,
    policy_version: 1,
    rules_hash: hexToBytes(RULES_HASH),
    guard_key_version: 1,
    basket_id: draft.basket_id,
    owner_id: draft.owner_id,
    agent_id: "agent.cpdemo.testnet",
    token_id: draft.token_id,
    payouts: draft.payouts.map((p) => ({ vendor_id: p.vendor_id, amount: BigInt(p.amount), line_count: p.line_count })),
    total: BigInt(draft.total),
    evidence_hash: hexToBytes(draft.evidence_hash),
    nonce,
    created_at_ms: now,
    expires_at_ms: now + 15n * 60_000n,
  };
  const bytes = encodePayload(payload);
  return {
    payload_b64: bytesToB64(bytes),
    hash_hex: basketHash(bytes),
    signature_b64: bytesToB64(crypto.getRandomValues(new Uint8Array(64))),
    guard_key_version: 1,
    expires_at_ms: payload.expires_at_ms.toString(),
  };
}

const EXPLAIN: Record<string, (f: Finding, o: Offer) => string> = {
  "R-04": (_, o) => `${o.seller_name} is the cheapest here, but its stand-in account isn't on the Vault's vendor allowlist, so Guard won't use it.`,
  "R-05": (f) => `This price is ${(f.inputs!.ratio_bps! / 100).toFixed(0)}% of the market median. Anything above 120% is blocked.`,
  "R-06": (f) => `At ${(f.inputs!.ratio_bps! / 100).toFixed(0)}% of median it's a little expensive, so it needs your review if picked.`,
  "R-07": (f) => `At ${(f.inputs!.ratio_bps! / 100).toFixed(0)}% of median it's suspiciously cheap. Intro prices and "starting at" plans often look like this.`,
  "R-09": () => "The same seller listed the same product twice. Guard keeps the cheaper copy and blocks the other.",
  "R-10": () => "The spec doesn't meet the item's minimum (for example fewer vCPUs or less RAM).",
};

function pipeline(run: Run, owner: string, text: string, constraints: Constraints) {
  let t = run.created;
  push(run, t, "request.created", { request_id: run.id, owner_id: owner, text, constraints } satisfies EventData["request.created"]);
  const { items, unmatched } = parse(text);
  t += 900;
  push(run, t, "research.parsed", { items });
  if (unmatched.length) push(run, (t += 250), "research.unmatched", { text: unmatched });
  if (!items.length) {
    push(run, (t += 300), "error", { code: "NO_ITEMS", message: "Nothing in the list matched the catalogue.", recoverable: true });
    return;
  }
  const keys = [...new Set(items.map((i) => i.item_key))];
  for (const k of keys) for (const o of OFFERS.filter((x) => x.item_key === k)) push(run, (t += 140), "research.offer", { offer: o });
  const verdicts: Verdict[] = [];
  t += 500;
  for (const k of keys) {
    const { verdicts: vs, median, ratios } = assess(k);
    for (const v of vs) {
      verdicts.push(v);
      push(run, (t += 160), "policy.verdict", { verdict: v, median_micro: median, ratio_bps: ratios[v.offer_id]! });
    }
  }
  for (const v of verdicts.filter((x) => x.level !== "ALLOW")) {
    const o = OFFERS.find((x) => x.offer_id === v.offer_id)!;
    const f = v.findings.find((x) => x.level === v.level)!;
    const ex = EXPLAIN[f.rule_id];
    if (ex) push(run, (t += 60), "explain.verdict", { offer_id: v.offer_id, text: ex(f, o) });
  }
  run.pending = { items, verdicts, owner, text, constraints };
  continueRun(run, t + 600, new Set());
}

function continueRun(run: Run, t: number, acked: Set<string>) {
  const { items, verdicts, owner, text, constraints } = run.pending!;
  const picks = coordinate(items, verdicts, acked, constraints.preferred_vendors ?? []);
  const draft = buildBasket(run.id, owner, text, constraints, picks, verdicts);
  push(run, t, "coordinator.basket", { basket: draft });
  const review = picks.filter((p) => p.review);
  if (review.length) {
    run.needsAck = review.map((p) => p.offer.offer_id);
    const reasons = Object.fromEntries(review.map((p) => [p.offer.offer_id, verdicts.find((v) => v.offer_id === p.offer.offer_id)!.findings.find((f) => f.level === "REVIEW")!.message]));
    push(run, t + 300, "coordinator.needs_ack", { offer_ids: run.needsAck, reasons });
    return;
  }
  const max = constraints.max_total ? BigInt(constraints.max_total) : null;
  if (max !== null && BigInt(draft.total) > max) {
    push(run, t + 500, "guard.refused", { code: "OVER_MAX_TOTAL", findings: [{ rule_id: "R-20", level: "BLOCK", message: "Basket total is over your max total" }] });
    return;
  }
  const signed = sign(draft);
  push(run, t + 900, "guard.signed", { signed, mock: true });
  push(run, t + 1100, "explain.basket", {
    text: `${draft.payouts.length} vendors, ${picks.length} lines. Every picked offer is within the allowed price band or was reviewed by you; blocked offers were left out.`,
  });
  push(run, t + 1300, "approval.waiting", { hash_hex: signed.hash_hex, expires_at_ms: signed.expires_at_ms });
}

const fakeTx = () => {
  const a = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  return Array.from(crypto.getRandomValues(new Uint8Array(44)), (b) => a[b % a.length]).join("");
};

export const mockClient: AgentsClient = {
  mode: "mock",
  async catalog() {
    return CATALOG;
  },
  async createRequest({ owner_id, text, constraints }) {
    const all = load();
    const id = crypto.randomUUID();
    const run: Run = { id, created: Date.now(), events: [], needsAck: [] };
    pipeline(run, owner_id, text, constraints);
    all[id] = run;
    save(all);
    return { request_id: id };
  },
  subscribe(id, onEvent, onError) {
    let last = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const pump = () => {
      const run = load()[id];
      if (!run) {
        onError?.("This request isn't stored in this browser (mock mode keeps requests locally).");
        return;
      }
      const now = Date.now();
      for (const e of run.events) {
        if (e.seq <= last) continue;
        if (e.due <= now) {
          last = e.seq;
          onEvent({ seq: e.seq, ts: new Date(e.due).toISOString(), type: e.type, data: e.data } as AgentEvent);
        } else {
          const tm = setTimeout(() => {
            timers.delete(tm);
            pump();
          }, e.due - now);
          timers.add(tm);
          break;
        }
      }
    };
    const onAppend = (ev: Event) => (ev as CustomEvent<string>).detail === id && pump();
    bus.addEventListener("append", onAppend);
    pump();
    return () => {
      bus.removeEventListener("append", onAppend);
      timers.forEach(clearTimeout);
    };
  },
  async acknowledge(id, offerIds) {
    const all = load();
    const run = all[id];
    if (!run?.pending) return;
    continueRun(run, Date.now() + 300, new Set([...offerIds, ...run.needsAck]));
    save(all);
    bus.dispatchEvent(new CustomEvent("append", { detail: id }));
  },
  async cancel(id) {
    const all = load();
    const run = all[id];
    if (!run) return;
    push(run, Date.now(), "error", { code: "CANCELLED", message: "Stopped watching this request. If you already approved it, revoke the approval in your Vault.", recoverable: false });
    save(all);
    bus.dispatchEvent(new CustomEvent("append", { detail: id }));
  },
  async simulateApproval(id) {
    const all = load();
    const run = all[id];
    if (!run) return;
    const signed = [...run.events].reverse().find((e) => e.type === "guard.signed")?.data as EventData["guard.signed"] | undefined;
    const basket = [...run.events].reverse().find((e) => e.type === "coordinator.basket")?.data as EventData["coordinator.basket"] | undefined;
    if (!signed || !basket) return;
    let t = Date.now() + 400;
    push(run, t, "approval.seen", { hash_hex: signed.signed.hash_hex });
    push(run, (t += 1500), "settlement.submitted", { tx_hash: fakeTx() });
    let failed = false;
    for (const p of basket.basket.payouts) {
      const bad = p.vendor_id.startsWith("vendor-06");
      failed ||= bad;
      push(run, (t += 1100), "settlement.payout", {
        vendor_id: p.vendor_id,
        amount: p.amount,
        status: bad ? "failed" : "settled",
        tx_hash: fakeTx(),
        ...(bad ? { reason: "vendor-06 is not registered on cpUSD; amount restored to available" } : {}),
      });
    }
    push(run, t + 900, "settlement.final", { status: failed ? "PartiallyPaid" : "Completed" });
    save(all);
    bus.dispatchEvent(new CustomEvent("append", { detail: id }));
  },
};
