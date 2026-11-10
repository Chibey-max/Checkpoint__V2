"use client";

import { ArrowDownLeft, Check, Fingerprint, KeyRound, Loader2, Pause, Play, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { VerdictBadge, type VerdictLevel } from "@/components/verdict-badge";
import { DEMO_HASH } from "@/lib/demo";
import { formatUsdMicro } from "@/lib/format";
import { Scramble } from "@/components/ui/scramble";

/**
 * "One basket, four stops", played like a short film in one screen: no scrolling through it.
 * Each stop's title comes up in the centre, the card below plays that stop, then both hand over to the next.
 * It starts when the section is in view, pauses when it leaves, and loops. The rail under the card shows
 * where it is and jumps to any stop; the button beside it pauses (WCAG 2.2.2).
 *
 * Smoothness: a rAF clock owns time, but React only hears about it a few times per stop (each "beat").
 * Everything in between is a CSS transition on opacity and transform, and the rail fills are written
 * straight to the DOM, so nothing re-renders per frame and nothing animates layout or paint.
 * Reduced motion: no clock; each stop shows its finished state and the rail switches stops.
 */

const STEPS = [
  {
    k: "Research",
    lead: "Agents find",
    em: "the offers.",
    body: "The list is parsed into catalogue items. Every matching offer in the snapshot comes back with its source and capture time.",
    ms: 6000,
    beats: [350],
  },
  {
    k: "Guard",
    lead: "Guard judges",
    em: "every price.",
    body: "Medians per item, ratios in basis points, allowlist and duplicate checks. Blocked offers never reach the basket.",
    ms: 7600,
    beats: [350, 2700, 4300],
  },
  {
    k: "You",
    lead: "You approve",
    em: "the exact bytes.",
    body: "The basket is decoded and re-hashed in your browser. Your wallet signs approve_basket for that hash, with 1 yocto.",
    ms: 7800,
    beats: [350, 2000, 4500],
  },
  {
    k: "Vault",
    lead: "The Vault checks,",
    em: "then pays.",
    body: "Signature, approval, allowlists, caps, expiry and replay are checked on-chain. Payouts settle from callbacks only.",
    ms: 8800,
    beats: [350, 2500, 4200, 6000],
  },
] as const;

/** which card plays each stop: research and Guard share the offers */
const LAYER_OF = [0, 0, 1, 2] as const;
/** how far a card has played (its "lp"): offers 0..4 over two stops, basket 0..3, vault 0..4 */
const FINAL = [4, 3, 4] as const;

const OFFERS: { item: string; seller: string; price: number; level: VerdictLevel; why: string }[] = [
  { item: "VPS", seller: "AWS Lightsail", price: 24_000_000, level: "ALLOW", why: "100% of median" },
  { item: "VPS", seller: "OVHcloud", price: 4_540_000, level: "REVIEW", why: "19% · unusually low" },
  { item: "Domain", seller: "Gandi", price: 11_710_000, level: "ALLOW", why: "99.6% of median" },
  { item: "Domain", seller: "IONOS", price: 1_000_000, level: "REVIEW", why: "8.5% · intro price" },
  { item: "Storage", seller: "Backblaze", price: 6_950_000, level: "ALLOW", why: "87% of median" },
  { item: "Storage", seller: "Cloudflare R2", price: 15_000_000, level: "BLOCK", why: "188% · over 120%" },
  { item: "Storage", seller: "DO Spaces", price: 20_000_000, level: "BLOCK", why: "250% · over 120%" },
  { item: "Email", seller: "Mailgun", price: 15_000_000, level: "ALLOW", why: "100% of median" },
  { item: "Email", seller: "Resend", price: 20_000_000, level: "BLOCK", why: "133% · over 120%" },
];
const GROUPS = ["VPS", "Domain", "Storage", "Email"].map((item) => ({ item, offers: OFFERS.map((o, i) => ({ ...o, i })).filter((o) => o.item === item) }));

const PAYOUTS = [
  { vendor: "vendor-02", label: "AWS Lightsail ×2 · Gandi", amount: "59.71", tx: "8XkQ…n4Tz", ok: true },
  { vendor: "vendor-03", label: "Mailgun", amount: "15.00", tx: "3vHd…a9Lp", ok: true },
  { vendor: "vendor-06", label: "Backblaze", amount: "6.95", tx: "Fq2m…Yw7c", ok: false },
];

const CHECKS = ["Guard signature (ed25519)", "Your approval for this hash", "Vendors on the allowlist", "Token on the allowlist", "Under basket and daily caps", "Not expired, never used"];

type Pos = "on" | "out" | "wait";

export function RunStory() {
  const ref = useRef<HTMLElement>(null);
  const fills = useRef<(HTMLSpanElement | null)[]>([]);
  const [ch, setCh] = useState(0);
  const [prev, setPrev] = useState(-1);
  const [beat, setBeat] = useState(0);
  const [inView, setInView] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [reduced, setReduced] = useState(false);
  const chRef = useRef(0);
  const beatRef = useRef(0);
  const elapsed = useRef(0);

  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(!!e?.isIntersecting), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const paint = useCallback((frac: number) => {
    const c = chRef.current;
    fills.current.forEach((el, i) => {
      if (el) el.style.transform = `scaleX(${i < c ? 1 : i === c ? frac : 0})`;
    });
  }, []);

  const go = useCallback((i: number) => {
    if (i !== chRef.current) setPrev(chRef.current);
    chRef.current = i;
    elapsed.current = 0;
    beatRef.current = 0;
    setCh(i);
    setBeat(0);
  }, []);

  const running = inView && playing && !reduced;
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current += Math.min(64, now - last); // a hidden tab or a long frame never skips a beat
      last = now;
      const s = STEPS[chRef.current]!;
      if (elapsed.current >= s.ms) {
        go((chRef.current + 1) % STEPS.length);
      } else {
        const b = s.beats.filter((t) => elapsed.current >= t).length;
        if (b !== beatRef.current) {
          beatRef.current = b;
          setBeat(b);
        }
      }
      paint(elapsed.current / STEPS[chRef.current]!.ms);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, go, paint]);

  // a jump while paused, or reduced motion, still has to redraw the rail
  useLayoutEffect(() => paint(reduced ? 1 : elapsed.current / STEPS[ch]!.ms), [ch, reduced, paint]);

  const b = reduced ? STEPS[ch]!.beats.length : beat;
  const layer = LAYER_OF[ch]!;
  const prevLayer = prev >= 0 && LAYER_OF[prev] !== layer ? LAYER_OF[prev]! : -1;
  const posOf = (i: number, cur: number, was: number): Pos => (i === cur ? "on" : i === was ? "out" : "wait");
  // the playing card follows the beats; the one leaving holds its last frame; the rest wait at the start
  const lp = (l: number) => {
    const pos = posOf(l, layer, prevLayer);
    if (pos === "wait") return 0;
    if (pos === "out") return FINAL[l]!;
    return l === 0 ? (ch === 1 ? 1 + b : b) : b;
  };

  const status =
    ch === 0 ? "researching" : ch === 1 ? (b >= 3 ? "signed by Guard" : "assessing") : ch === 2 ? (b >= 3 ? "approved" : "awaiting approval") : b >= 4 ? "final" : "settling";
  const done = (ch === 3 && b >= 4) || (ch === 2 && b >= 3) || (ch === 1 && b >= 3);

  return (
    <section ref={ref} aria-labelledby="run-title" className="relative flex min-h-[100svh] flex-col justify-center pt-28 pb-14 max-md:pt-40">
      <h2 id="run-title" className="eyebrow mx-auto">
        Follow the money through the locks
      </h2>

      {/* the stop's title, centred: the old one lifts away as the new one rises in */}
      <div className="mx-auto mt-5 grid w-full max-w-[880px] text-center">
        {STEPS.map((s, i) => {
          const pos = posOf(i, ch, prev);
          return (
            <div key={s.k} data-pos={pos} aria-hidden={pos !== "on"} className="rs-swap rs-title col-start-1 row-start-1">
              <p className="font-mono text-[10.5px] tracking-[0.24em] text-accent uppercase">
                Stop 0{i + 1} of 04 · {s.k}
              </p>
              <h3 className="display mt-3 text-[clamp(2.1rem,3.7vw,3.3rem)] text-fg">
                {s.lead} <span className="gilt font-medium italic">{s.em}</span>
              </h3>
              <p className="mx-auto mt-3 max-w-[54rem] text-[14.5px] leading-relaxed text-muted max-md:max-w-[34rem]">{s.body}</p>
            </div>
          );
        })}
      </div>

      {/* the card that plays it */}
      <div className="rs-card mx-auto mt-7 w-full max-w-[880px] h-[clamp(372px,calc(100svh-380px),450px)] max-md:h-[540px]">
        <div className="flex h-[45px] items-center justify-between border-b border-line px-5">
          <span className="font-mono text-[11px] text-muted">request 7c1e…a90b</span>
          <span key={status} className="flex items-center gap-1.5 font-mono text-[11px] text-accent [animation:fade-up_400ms_var(--ease-out-soft)]">
            {done ? <Check aria-hidden className="size-3.5" /> : <Loader2 aria-hidden className="size-3.5 animate-spin" />}
            {status}
          </span>
        </div>

        <Layer pos={posOf(0, layer, prevLayer)}>
          <OffersCard lp={lp(0)} />
        </Layer>
        <Layer pos={posOf(1, layer, prevLayer)}>
          <BasketCard lp={lp(1)} reduced={reduced} />
        </Layer>
        <Layer pos={posOf(2, layer, prevLayer)}>
          <VaultCard lp={lp(2)} />
        </Layer>
      </div>

      {/* the rail: where the film is, and a way to any stop */}
      <div className="mx-auto mt-6 flex w-full max-w-[880px] items-start gap-4">
        <ol className="grid flex-1 grid-cols-4 gap-2.5">
          {STEPS.map((s, i) => (
            <li key={s.k}>
              <button type="button" onClick={() => go(i)} aria-current={i === ch ? "step" : undefined} className="rs-seg group block w-full pt-2 text-left">
                <span className="block h-[3px] overflow-hidden rounded-full bg-line">
                  <span
                    ref={(el) => {
                      fills.current[i] = el;
                    }}
                    className="rs-fill block h-full rounded-full"
                  />
                </span>
                <span className="mt-2 flex items-baseline gap-2 font-mono text-[10.5px] tracking-[0.16em] uppercase">
                  <span className="text-faint">0{i + 1}</span>
                  <span className={`transition-colors duration-300 ${i === ch ? "text-fg" : "text-muted group-hover:text-fg"}`}>{s.k}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
        {!reduced && (
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause the walkthrough" : "Play the walkthrough"}
            className="key key-secondary mt-0.5 size-9 shrink-0 rounded-full"
          >
            {playing ? <Pause aria-hidden className="size-3.5" /> : <Play aria-hidden className="size-3.5" />}
          </button>
        )}
      </div>
    </section>
  );
}

function Layer({ pos, children }: { pos: Pos; children: React.ReactNode }) {
  return (
    <div data-pos={pos} aria-hidden={pos !== "on"} className="rs-swap rs-layer absolute inset-x-0 top-[45px] bottom-0 flex flex-col justify-center p-5 max-md:p-4">
      {children}
    </div>
  );
}

/** research lays the offers out by item; Guard then stamps each one, strikes the blocked and signs the rest */
function OffersCard({ lp }: { lp: number }) {
  const shown = lp >= 1;
  const judged = lp >= 2;
  const struck = lp >= 3;
  const signed = lp >= 4;
  return (
    <>
      <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.14em] text-faint uppercase">
        <span>Snapshot v0 · 9 offers · 4 items</span>
        <span className="max-sm:hidden">Guard · ratio to median</span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-3 max-md:grid-cols-2">
        {GROUPS.map((g) => (
          <div key={g.item}>
            <p className="pb-1.5 font-mono text-[10px] tracking-[0.18em] text-muted uppercase">{g.item}</p>
            <ul className="space-y-1.5">
              {g.offers.map((o) => {
                const off = struck && o.level === "BLOCK";
                return (
                  <li
                    key={o.seller}
                    data-on={shown}
                    data-off={off}
                    className="rs-tile panel rounded-xl px-3 py-2"
                    style={{ transitionDelay: shown && !struck ? `${o.i * 70}ms` : "0ms" }}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-[13px] font-medium text-fg ${off ? "line-through decoration-bad/70" : ""}`}>{o.seller}</span>
                      <span className="font-mono text-[12px] text-fg tabular">{formatUsdMicro(o.price)}</span>
                    </span>
                    <span data-on={judged} className="rs-stamp mt-1.5 flex items-center gap-1.5" style={{ transitionDelay: judged && !struck ? `${o.i * 110}ms` : "0ms" }}>
                      <VerdictBadge level={o.level} size="xs" />
                      <span className="truncate font-mono text-[10px] text-muted max-sm:hidden">{o.why}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div data-on={signed} className="rs-rise mt-3.5 flex items-center justify-between rounded-xl border border-line px-3 py-2 font-mono text-[11px]">
        <span className="flex items-center gap-1.5 text-accent">
          <ShieldCheck aria-hidden className="size-3.5" /> 4 offers into the basket · signed by Guard key v1
        </span>
        <span className="text-faint max-sm:hidden">rules_hash 7d1c…e04a</span>
      </div>
    </>
  );
}

/** the basket as the browser decodes it, its hash, then the wallet asking for that exact hash */
function BasketCard({ lp, reduced }: { lp: number; reduced: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1 max-md:gap-3">
      <div>
        <p className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">Basket · decoded from the exact bytes</p>
        <ul className="mt-3 space-y-1.5">
          {PAYOUTS.map((pay, i) => (
            <li key={pay.vendor} data-on={lp >= 1} className="rs-tile panel flex items-center justify-between rounded-xl px-4 py-2.5" style={{ transitionDelay: `${i * 90}ms` }}>
              <span>
                <span className="block font-mono text-[13px] text-fg">{pay.vendor}</span>
                <span className="block text-[11.5px] text-faint">stand-in for {pay.label}</span>
              </span>
              <span className="font-mono text-[14px] text-fg tabular">{pay.amount}</span>
            </li>
          ))}
        </ul>
        <div data-on={lp >= 1} className="rs-rise mt-3 flex items-baseline justify-between px-1 max-md:mt-2" style={{ transitionDelay: "300ms" }}>
          <span className="text-sm text-muted">Total</span>
          <span className="text-2xl font-semibold text-fg tabular max-md:text-xl">81.66 cpUSD</span>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div data-on={lp >= 1} className="rs-rise rounded-xl border border-line px-3 py-2.5 max-md:hidden" style={{ transitionDelay: "200ms" }}>
          <p className="font-mono text-[10px] tracking-wider text-faint uppercase">sha256(domain ‖ borsh(payload))</p>
          <p className="mt-1 font-mono text-[12px] leading-relaxed break-all text-fg">
            <Scramble text={DEMO_HASH} play={lp === 1 && !reduced} duration={1300} />
          </p>
        </div>
        {/* the wallet sheet rises in from below */}
        <div data-on={lp >= 2} className="rs-sheet rounded-2xl border border-line-strong bg-[var(--color-surface)] p-4 shadow-[0_-18px_50px_-24px_rgb(0_0_0/0.8)]">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium text-fg">
              <KeyRound aria-hidden className="size-4 text-accent" /> approve_basket
            </span>
            <span className="font-mono text-[11px] text-muted max-sm:hidden">vault.cpdemo.testnet · 1 yocto</span>
          </div>
          <p className="mt-2 truncate font-mono text-[10.5px] text-faint md:hidden">hash {DEMO_HASH.slice(0, 10)}…{DEMO_HASH.slice(-8)} · 1 yocto</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <span className="key key-secondary h-10 text-sm">Reject</span>
            <span data-on={lp >= 3} className="rs-press key key-primary h-10 text-sm">
              {lp >= 3 ? <Check aria-hidden className="size-4" /> : <Fingerprint aria-hidden className="size-4" />}
              {lp >= 3 ? "Approved" : "Approve"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** the Vault's checks tick through, the payouts go out, and one comes back */
function VaultCard({ lp }: { lp: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-6 max-md:grid-cols-1 max-md:gap-4">
      <div>
        <p className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">Vault · execute_basket</p>
        <ul className="mt-3 space-y-2.5 max-md:grid max-md:grid-cols-2 max-md:gap-x-3 max-md:gap-y-1.5 max-md:space-y-0">
          {CHECKS.map((c, i) => {
            const ok = lp >= 1;
            return (
              <li key={c} className="flex items-center gap-2.5 text-[13px] text-fg max-md:text-[11.5px]">
                <span className="relative grid size-[18px] shrink-0 place-items-center rounded-full ring-1 ring-line">
                  <span data-on={ok} className="rs-tick absolute inset-0 grid place-items-center rounded-full bg-accent text-accent-fg" style={{ transitionDelay: ok ? `${i * 220}ms` : "0ms" }}>
                    <Check aria-hidden className="size-2.5" strokeWidth={3} />
                  </span>
                </span>
                <span data-on={ok} className="rs-dim" style={{ transitionDelay: ok ? `${i * 220}ms` : "0ms" }}>
                  {c}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <ul className="space-y-1.5">
          {PAYOUTS.map((pay, i) => {
            const sent = lp >= 2;
            const final = lp >= 3;
            return (
              <li key={pay.vendor} data-on={sent} className="rs-dim panel flex items-center justify-between rounded-xl px-4 py-2.5" style={{ transitionDelay: sent && !final ? `${i * 160}ms` : "0ms" }}>
                <span className="flex items-center gap-3">
                  <span
                    className={`grid size-7 place-items-center rounded-full ring-1 ring-inset transition-colors duration-500 ${
                      !final ? "text-muted ring-line" : pay.ok ? "bg-ok-soft text-ok ring-ok/30" : "bg-warn-soft text-warn ring-warn/30"
                    }`}
                    style={{ transitionDelay: final ? `${i * 200}ms` : "0ms" }}
                  >
                    {!final ? <Loader2 aria-hidden className={`size-3.5 ${sent ? "animate-spin" : ""}`} /> : pay.ok ? <Check aria-hidden className="size-3.5" /> : <ArrowDownLeft aria-hidden className="size-3.5" />}
                  </span>
                  <span>
                    <span className="block font-mono text-[13px] text-fg">{pay.vendor}</span>
                    <span className="block font-mono text-[10.5px] text-faint">{!final ? (sent ? "ft_transfer…" : "queued") : pay.ok ? `payout_settled · ${pay.tx}` : "payout_failed · restored to available"}</span>
                  </span>
                </span>
                <span className={`font-mono text-[14px] tabular ${final && !pay.ok ? "text-warn line-through decoration-warn/60" : "text-fg"}`}>{pay.amount}</span>
              </li>
            );
          })}
        </ul>
        <div data-on={lp >= 4} className="rs-rise mt-3 flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-[13px] text-fg">
          <span className="rounded-full bg-warn-soft px-2 py-0.5 font-mono text-[10.5px] text-warn ring-1 ring-inset ring-warn/30">PartiallyPaid</span>
          74.71 paid · 6.95 back in your vault
        </div>
      </div>
    </div>
  );
}
