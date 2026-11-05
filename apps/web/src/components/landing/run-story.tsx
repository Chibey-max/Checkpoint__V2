"use client";

import { ArrowDownLeft, Check, Fingerprint, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { VerdictBadge, type VerdictLevel } from "@/components/verdict-badge";
import { DEMO_HASH } from "@/lib/demo";
import { formatUsdMicro } from "@/lib/format";
import { Scramble } from "@/components/ui/scramble";

/**
 * "One basket, four stops": a pinned section that plays the whole run as the visitor scrolls.
 * The section is four screens tall; its stage sticks to the viewport and switches state at fixed
 * scroll thresholds, while CSS transitions carry each change. Thresholds rather than a continuous scrub,
 * so a fast flick never leaves the stage half-drawn, and every state is a real, readable layout.
 * Reduced motion gets the four steps as plain text and the final state, nothing gated on scrolling.
 */

const STEPS = [
  { k: "Research", title: "Agents find the offers", body: "The list is parsed into catalogue items. Every matching offer in the snapshot comes back with its source and capture time." },
  { k: "Guard", title: "Guard judges every price", body: "Medians per item, ratios in basis points, allowlist and duplicate checks. Blocked offers never reach the basket." },
  { k: "You", title: "You approve the exact bytes", body: "The basket is decoded and re-hashed in your browser. Your wallet signs approve_basket for that hash, with 1 yocto." },
  { k: "Vault", title: "The Vault checks, then pays", body: "Signature, approval, allowlists, caps, expiry and replay are checked on-chain. Payouts settle from callbacks only." },
] as const;

const OFFERS: { item: string; seller: string; price: number; level: VerdictLevel; why: string; pick?: boolean }[] = [
  { item: "VPS", seller: "AWS Lightsail", price: 24_000_000, level: "ALLOW", why: "100% of median", pick: true },
  { item: "VPS", seller: "OVHcloud", price: 4_540_000, level: "REVIEW", why: "19% · unusually low" },
  { item: "Domain", seller: "Gandi", price: 11_710_000, level: "ALLOW", why: "99.6% of median", pick: true },
  { item: "Domain", seller: "IONOS", price: 1_000_000, level: "REVIEW", why: "8.5% · intro price" },
  { item: "Storage", seller: "Backblaze", price: 6_950_000, level: "ALLOW", why: "87% of median", pick: true },
  { item: "Storage", seller: "Cloudflare R2", price: 15_000_000, level: "BLOCK", why: "188% · over 120%" },
  { item: "Storage", seller: "DO Spaces", price: 20_000_000, level: "BLOCK", why: "250% · over 120%" },
  { item: "Email", seller: "Mailgun", price: 15_000_000, level: "ALLOW", why: "100% of median", pick: true },
  { item: "Email", seller: "Resend", price: 20_000_000, level: "BLOCK", why: "133% · over 120%" },
];

const PAYOUTS = [
  { vendor: "vendor-02", label: "AWS Lightsail ×2 · Gandi", amount: "59.71", tx: "8XkQ…n4Tz", ok: true },
  { vendor: "vendor-03", label: "Mailgun", amount: "15.00", tx: "3vHd…a9Lp", ok: true },
  { vendor: "vendor-06", label: "Backblaze", amount: "6.95", tx: "Fq2m…Yw7c", ok: false },
];

const CHECKS = ["Guard signature (ed25519)", "Your approval for this hash", "Vendors on the allowlist", "Token on the allowlist", "Under basket and daily caps", "Not expired, never used"];

function useStickyProgress(ref: React.RefObject<HTMLElement | null>) {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      setP(span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [ref]);
  return p;
}

export function RunStory() {
  const ref = useRef<HTMLElement>(null);
  const p = useStickyProgress(ref);
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);

  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  if (narrow) {
    return (
      <section aria-labelledby="run-title" className="py-20">
        <p className="eyebrow">One basket, four stops</p>
        <h2 id="run-title" className="mt-3 text-4xl font-semibold text-fg">
          Follow the money <span className="font-serif font-normal text-muted">through the locks.</span>
        </h2>
        <ol className="mt-10 space-y-10">
          {STEPS.map((s, i) => (
            <li key={s.k}>
              <p className="flex items-center gap-3 text-[15px] font-semibold text-fg">
                <span className="grid size-7 place-items-center rounded-full bg-accent-soft font-mono text-[11px] text-accent ring-1 ring-inset ring-accent/30">0{i + 1}</span>
                {s.title}
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{s.body}</p>
              <div className="mt-4">
                <StageCard stage={i} local={1} reduced />
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  const stage = reduced ? 3 : Math.min(3, Math.floor(p * 4.0001));
  const local = reduced ? 1 : Math.min(1, Math.max(0, p * 4 - stage)); // progress inside the current stage

  return (
    <section ref={ref} aria-labelledby="run-title" className={reduced ? "py-24" : "relative h-[420vh]"}>
      <div className={reduced ? "" : "sticky top-0 flex h-screen items-center"}>
        <div className="grid w-full grid-cols-1 items-center gap-10 py-20 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          {/* steps */}
          <div>
            <p className="eyebrow">One basket, four stops</p>
            <h2 id="run-title" className="mt-3 text-4xl font-semibold text-fg sm:text-5xl">
              Follow the money <span className="font-serif font-normal text-muted">through the locks.</span>
            </h2>
            <ol className="mt-10 space-y-1">
              {STEPS.map((s, i) => {
                const on = i === stage;
                const done = i < stage;
                return (
                  <li key={s.k} className={`relative rounded-2xl p-4 pl-14 transition-all duration-500 ${on ? "panel" : ""}`}>
                    <span
                      className={`absolute top-4 left-4 grid size-7 place-items-center rounded-full font-mono text-[11px] ring-1 ring-inset transition-colors duration-500 ${
                        on ? "bg-accent text-accent-fg ring-accent" : done ? "bg-accent-soft text-accent ring-accent/30" : "text-faint ring-line"
                      }`}
                    >
                      {done ? <Check aria-hidden className="size-3.5" /> : `0${i + 1}`}
                    </span>
                    <p className={`text-[15px] font-semibold tracking-tight transition-colors ${on || reduced ? "text-fg" : "text-muted"}`}>
                      <span className="mr-2 font-mono text-[10.5px] tracking-[0.16em] text-faint uppercase">{s.k}</span>
                      {s.title}
                    </p>
                    <div className={`grid transition-[grid-template-rows,opacity] duration-500 ${on || reduced ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                      <p className="overflow-hidden pt-1.5 text-[13.5px] leading-relaxed text-muted">{s.body}</p>
                    </div>
                    {on && !reduced && (
                      <span className="absolute right-4 bottom-0 left-14 h-px overflow-hidden bg-line">
                        <span className="block h-full bg-accent" style={{ width: `${local * 100}%` }} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          {/* stage */}
          <StageCard stage={stage} local={local} reduced={reduced} />
        </div>
      </div>
    </section>
  );
}

function StageCard({ stage, local, reduced }: { stage: number; local: number; reduced: boolean }) {
  return (
      <div className="glass relative h-[560px] overflow-hidden rounded-[26px]">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="font-mono text-[11px] text-muted">request 7c1e…a90b</span>
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-accent">
            {stage < 3 || local < 0.95 ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Check aria-hidden className="size-3.5" />}
            {["researching", "assessing", "awaiting approval", local < 0.95 ? "settling" : "final"][stage]}
          </span>
        </div>

        {/* layer 1: offers (research + guard) */}
        <Layer on={stage <= 1}>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left font-mono text-[10px] tracking-wider text-faint uppercase">
                <th className="hidden pb-2 font-normal sm:table-cell">Item</th>
                <th className="pb-2 font-normal">Seller</th>
                <th className="pb-2 text-right font-normal">Price</th>
                <th className="w-[38%] pb-2 pl-4 font-normal">Guard</th>
              </tr>
            </thead>
            <tbody>
              {OFFERS.map((o, i) => {
                const shown = stage > 0 || local > i / OFFERS.length;
                const judged = stage === 1 && local > 0.08 + i * 0.07;
                const struck = judged && o.level === "BLOCK" && local > 0.75;
                return (
                  <tr
                    key={o.seller}
                    className="border-t border-line transition-all duration-500"
                    style={{ opacity: shown ? (struck ? 0.38 : 1) : 0, transform: shown ? "none" : "translateY(10px)" }}
                  >
                    <td className="hidden py-2.5 font-mono text-[11px] text-faint sm:table-cell">{o.item}</td>
                    <td className={`py-2.5 font-medium text-fg ${struck ? "line-through decoration-bad/70" : ""}`}>{o.seller}</td>
                    <td className="py-2.5 text-right font-mono text-fg tabular">{formatUsdMicro(o.price)}</td>
                    <td className="py-2.5 pl-4">
                      <span className="flex items-center gap-2 transition-opacity duration-500" style={{ opacity: judged ? 1 : 0 }}>
                        <VerdictBadge level={o.level} size="xs" />
                        <span className="hidden truncate font-mono text-[10.5px] text-muted sm:inline">{o.why}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-line px-3 py-2 font-mono text-[11px] transition-opacity duration-500" style={{ opacity: stage === 1 && local > 0.85 ? 1 : 0 }}>
            <span className="flex items-center gap-1.5 text-accent">
              <ShieldCheck aria-hidden className="size-3.5" /> basket signed by Guard key v1
            </span>
            <span className="text-faint">rules_hash 7d1c…e04a</span>
          </div>
        </Layer>

        {/* layer 2: basket + wallet */}
        <Layer on={stage === 2}>
          <p className="eyebrow">Basket · decoded from the exact bytes</p>
          <ul className="mt-4 space-y-2">
            {PAYOUTS.map((pay) => (
              <li key={pay.vendor} className="panel flex items-center justify-between rounded-xl px-4 py-3">
                <span>
                  <span className="block font-mono text-[13px] text-fg">{pay.vendor}</span>
                  <span className="block text-[11.5px] text-faint">stand-in for {pay.label}</span>
                </span>
                <span className="font-mono text-[15px] text-fg tabular">{pay.amount}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-baseline justify-between px-1">
            <span className="text-sm text-muted">Total</span>
            <span className="text-2xl font-semibold text-fg tabular">81.66 cpUSD</span>
          </div>
          <div className="mt-3 rounded-xl border border-line px-3 py-2.5">
            <p className="font-mono text-[10px] tracking-wider text-faint uppercase">sha256(domain ‖ borsh(payload))</p>
            <p className="mt-1 font-mono text-[12px] break-all text-fg">
              <Scramble text={DEMO_HASH} play={stage === 2 && !reduced} />
            </p>
          </div>
          {/* wallet sheet */}
          <div
            className="absolute inset-x-5 bottom-5 rounded-2xl border border-line-strong bg-[var(--color-surface)] p-4 shadow-[0_-20px_60px_-20px_rgb(0_0_0/0.7)] transition-transform duration-700 ease-[var(--ease-out-soft)]"
            style={{ transform: stage === 2 && local > 0.35 ? "translateY(0)" : "translateY(120%)" }}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-fg">
                <KeyRound aria-hidden className="size-4 text-accent" /> approve_basket
              </span>
              <span className="font-mono text-[11px] text-muted">vault.cpdemo.testnet · 1 yocto</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <span className="key key-secondary h-10 text-sm">Reject</span>
              <span className={`key key-primary h-10 text-sm transition-transform ${local > 0.8 ? "translate-y-px scale-[0.99]" : ""}`}>
                {local > 0.8 ? <Check aria-hidden className="size-4" /> : <Fingerprint aria-hidden className="size-4" />}
                {local > 0.8 ? "Approved" : "Approve"}
              </span>
            </div>
          </div>
        </Layer>

        {/* layer 3: vault */}
        <Layer on={stage === 3}>
          <p className="eyebrow">Vault · execute_basket</p>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
            {CHECKS.map((c, i) => {
              const ok = local > 0.05 + i * 0.06;
              return (
                <li key={c} className="flex items-center gap-2 text-[12.5px] transition-colors duration-300" style={{ color: ok ? "var(--color-fg)" : "var(--color-faint)" }}>
                  <span className={`grid size-4 place-items-center rounded-full transition-all duration-300 ${ok ? "bg-accent text-accent-fg" : "ring-1 ring-line"}`}>
                    {ok && <Check aria-hidden className="size-2.5" strokeWidth={3} />}
                  </span>
                  {c}
                </li>
              );
            })}
          </ul>
          <ul className="mt-6 space-y-2">
            {PAYOUTS.map((pay, i) => {
              const sent = local > 0.45 + i * 0.1;
              const final = local > 0.62 + i * 0.1;
              return (
                <li
                  key={pay.vendor}
                  className="panel flex items-center justify-between rounded-xl px-4 py-3 transition-all duration-500"
                  style={{ opacity: sent ? 1 : 0.25 }}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`grid size-7 place-items-center rounded-full ring-1 ring-inset transition-colors duration-500 ${
                        !final ? "text-muted ring-line" : pay.ok ? "bg-ok-soft text-ok ring-ok/30" : "bg-warn-soft text-warn ring-warn/30"
                      }`}
                    >
                      {!final ? <Loader2 aria-hidden className={`size-3.5 ${sent ? "animate-spin" : ""}`} /> : pay.ok ? <Check aria-hidden className="size-3.5" /> : <ArrowDownLeft aria-hidden className="size-3.5" />}
                    </span>
                    <span>
                      <span className="block font-mono text-[13px] text-fg">{pay.vendor}</span>
                      <span className="block font-mono text-[10.5px] text-faint">
                        {!final ? "ft_transfer…" : pay.ok ? `payout_settled · ${pay.tx}` : "payout_failed · restored to available"}
                      </span>
                    </span>
                  </span>
                  <span className={`font-mono text-[15px] tabular ${final && !pay.ok ? "text-warn line-through decoration-warn/60" : "text-fg"}`}>{pay.amount}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex items-center justify-between rounded-xl border border-line px-3 py-2.5 transition-opacity duration-500" style={{ opacity: local > 0.92 ? 1 : 0 }}>
            <span className="flex items-center gap-2 text-[13px] text-fg">
              <span className="rounded-full bg-warn-soft px-2 py-0.5 font-mono text-[10.5px] text-warn ring-1 ring-inset ring-warn/30">PartiallyPaid</span>
              74.71 paid · 6.95 back in your vault
            </span>
          </div>
        </Layer>
      </div>
  );
}

function Layer({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={!on}
      className="absolute inset-x-0 top-[49px] bottom-0 p-5 transition-all duration-700 ease-[var(--ease-out-soft)]"
      style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(14px) scale(0.985)", pointerEvents: on ? "auto" : "none" }}
    >
      {children}
    </div>
  );
}
