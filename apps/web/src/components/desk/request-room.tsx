"use client";

import { AlertTriangle, ArrowLeft, Check, CircleSlash, FlaskConical, ScanSearch, WifiOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useReducer, useState } from "react";
import { TrustLabel } from "@/components/trust-label";
import { agents } from "@/lib/agents/client";
import { initialView, reduce, type Stage } from "@/lib/agents/reducer";
import type { AgentEvent } from "@/lib/agents/types";
import { humanError } from "@/lib/errors";
import { approveBasket } from "@/lib/tx";
import { useWallet } from "@/lib/wallet";
import { BasketCard } from "./basket-card";
import { OffersBoard } from "./offers-board";
import { Timeline } from "./timeline";

const STAGE: Record<Stage, { label: string; tone: "info" | "warn" | "ok" | "bad" }> = {
  parsing: { label: "Parsing your list", tone: "info" },
  researching: { label: "Researching offers", tone: "info" },
  assessing: { label: "Guard is checking prices", tone: "info" },
  needs_ack: { label: "Needs your review", tone: "warn" },
  signing: { label: "Guard is signing", tone: "info" },
  awaiting_approval: { label: "Waiting for your approval", tone: "warn" },
  executing: { label: "Vault is paying", tone: "info" },
  final: { label: "Settled", tone: "ok" },
  refused: { label: "Refused by Guard", tone: "bad" },
  expired: { label: "Approval window expired", tone: "bad" },
  error: { label: "Stopped", tone: "bad" },
};
const TONE = { info: "text-info ring-info/30", warn: "text-warn ring-warn/30", ok: "text-ok ring-ok/30", bad: "text-bad ring-bad/30" };

export function RequestRoom({ id }: { id: string }) {
  const [view, dispatch] = useReducer((s: ReturnType<typeof initialView>, e: AgentEvent) => reduce(s, e), id, initialView);
  const [conn, setConn] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [ackd, setAckd] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"ack" | "approve" | null>(null);
  const { accountId, send, signIn } = useWallet();

  useEffect(() => agents.subscribe(id, (e) => (setConn(null), dispatch(e)), setConn), [id]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  async function acknowledge() {
    if (!view.needsAck) return;
    setBusy("ack");
    try {
      await agents.acknowledge(id, view.needsAck.offer_ids);
    } catch (e) {
      setToast({ tone: "bad", text: humanError(e) });
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!view.signed) return;
    setBusy("approve");
    try {
      if (agents.mode === "mock") await agents.simulateApproval?.(id);
      else {
        if (!accountId) {
          await signIn();
          return;
        }
        await send(approveBasket(view.signed.hash_hex, view.signed.expires_at_ms));
        setToast({ tone: "ok", text: "Approval sent. The settlement agent picks it up within a few seconds." });
      }
    } catch (e) {
      setToast({ tone: "bad", text: humanError(e) });
    } finally {
      setBusy(null);
    }
  }

  const st = STAGE[view.stage];
  const firstLine = view.text.split("\n")[0] ?? "";

  return (
    <div className="pt-10">
      <Link href="/desk" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft aria-hidden className="size-4" /> Desk
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 pb-8">
        <div className="min-w-0">
          <p className="eyebrow">Request · {id.slice(0, 8)}</p>
          <h1 className="mt-2 truncate text-3xl font-semibold text-fg sm:text-4xl">{view.items.length ? `${view.items.length} items` : firstLine || "Loading…"}</h1>
          {view.text && <p className="mt-2 max-w-2xl truncate font-mono text-[12px] text-muted">{view.text.replace(/\n/g, " · ")}</p>}
        </div>
        <div className="flex items-center gap-2">
          {agents.mode === "mock" && (
            <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10.5px] tracking-[0.12em] text-info uppercase ring-1 ring-inset ring-info/30">
              <FlaskConical aria-hidden className="size-3.5" /> Mock agents
            </span>
          )}
          <span aria-live="polite" className={`rounded-full px-3 py-1 text-[12.5px] font-medium ring-1 ring-inset ${TONE[st.tone]}`}>
            {st.label}
          </span>
          {!["final", "error", "refused", "expired"].includes(view.stage) && (
            <button onClick={() => agents.cancel(id)} className="key key-ghost h-8 px-3 text-xs">
              <CircleSlash aria-hidden className="size-3.5" /> Stop watching
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_minmax(0,420px)]">
        <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <div className="panel rounded-[var(--radius-card)] p-3">
            <p className="eyebrow px-2.5 pt-1.5 pb-2">Agent timeline</p>
            <Timeline view={view} />
          </div>
          {conn && (
            <p className="flex items-start gap-2 rounded-2xl bg-warn-soft px-3 py-2 text-[12.5px] text-warn ring-1 ring-inset ring-warn/30">
              <WifiOff aria-hidden className="mt-0.5 size-4 shrink-0" /> {conn}
            </p>
          )}
        </aside>

        <div className="min-w-0 space-y-4">
          {view.unmatched.length > 0 && (
            <div className="flex items-start gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-[13px] text-warn ring-1 ring-inset ring-warn/30">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                Not in the catalogue, so nothing was guessed: <span className="font-mono">{view.unmatched.map((u) => `“${u}”`).join(", ")}</span>
              </span>
            </div>
          )}
          {view.errors.map((e, i) => (
            <div key={i} className="flex items-start gap-3 rounded-2xl bg-bad-soft px-4 py-3 text-[13px] text-bad ring-1 ring-inset ring-bad/30">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /> {e.message}
            </div>
          ))}
          {view.order.length === 0 && !view.errors.length ? (
            <div className="panel flex flex-col items-center rounded-[var(--radius-card)] py-20 text-center">
              <ScanSearch aria-hidden className="size-8 animate-pulse text-accent" />
              <p className="mt-3 text-sm text-fg">Agents are reading your list</p>
              <p className="mt-1 font-mono text-[11px] text-muted">offers appear here as they're found</p>
            </div>
          ) : (
            <OffersBoard view={view} />
          )}
        </div>

        <div className="space-y-4 lg:col-span-2 lg:col-start-2 xl:col-span-1 xl:col-start-3 xl:row-start-1 xl:sticky xl:top-28 xl:self-start">
          {view.needsAck && (
            <section className="panel rounded-[var(--radius-card)] p-5 ring-1 ring-inset ring-warn/30">
              <p className="eyebrow text-warn">Your review</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-fg">Some lines need a second look</h2>
              <p className="mt-1 text-[13px] text-muted">No offer for these items passed every rule. The best one is flagged, not blocked; it goes in only if you say so.</p>
              <ul className="mt-4 space-y-2">
                {view.needsAck.offer_ids.map((oid) => {
                  const o = view.offers[oid];
                  const on = ackd.has(oid);
                  return (
                    <li key={oid}>
                      <label className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 ring-inset transition-colors ${on ? "bg-warn-soft ring-warn/40" : "ring-line"}`}>
                        <input type="checkbox" checked={on} onChange={() => setAckd((s) => { const n = new Set(s); if (on) n.delete(oid); else n.add(oid); return n; })} className="mt-0.5 accent-[var(--color-warn)]" />
                        <span className="text-[13px]">
                          <span className="block font-medium text-fg">{o?.seller_name ?? oid}</span>
                          <span className="block text-warn">{view.needsAck!.reasons[oid]}</span>
                          <span className="block text-[11.5px] text-muted">I reviewed this and want it in the basket.</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <button onClick={acknowledge} disabled={busy === "ack" || view.needsAck.offer_ids.some((o) => !ackd.has(o))} className="key key-secondary mt-4 h-10 w-full text-sm">
                <Check aria-hidden className="size-4" /> Acknowledge and re-plan
              </button>
            </section>
          )}
          {view.refused && (
            <section className="panel rounded-[var(--radius-card)] p-5 ring-1 ring-inset ring-bad/30">
              <p className="eyebrow text-bad">Guard refused to sign</p>
              <ul className="mt-3 space-y-1 text-[13px] text-bad">
                {view.refused.findings.map((f) => (
                  <li key={f.rule_id}>
                    <span className="mr-2 font-mono text-[11px]">{f.rule_id}</span>
                    {f.message}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <BasketCard view={view} mode={agents.mode} onApprove={approve} approving={busy === "approve"} />
          {view.basketNote && (
            <p className="flex items-start gap-2 px-1 text-[12.5px] leading-relaxed text-muted">
              <TrustLabel kind="advisory" /> <span>{view.basketNote}</span>
            </p>
          )}
        </div>
      </div>

      {toast && (
        <div role="status" className={`glass fixed right-5 bottom-5 z-50 max-w-sm rounded-2xl px-4 py-3 text-[13px] ${toast.tone === "ok" ? "text-ok" : "text-bad"}`} style={{ animation: "fade-up 300ms var(--ease-out-soft)" }}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
