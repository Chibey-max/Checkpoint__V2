"use client";

import { ArrowRight, ChevronDown, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ALL_DONE, GuardCard, VaultCard, YouCard, type LockSteps } from "./lock-story";
import { VaultDoor } from "./vault-door";
import { Tumbler } from "./tumbler";
import { easeInOut, passed, seg, T } from "./vault-timeline";

const HEADLINE = ["Your agents shop.", "Three locks decide."];
const BODY =
  "Agents research real offers and build a basket. Guard checks every price and signs only that basket. You approve its exact hash, and the Vault checks your caps before a single cpUSD moves.";

/** Handwriting speed: the headline is written slowly, the paragraph quicker, like a signature then a note. */
const HEAD_CPS = 16;
const BODY_CPS = 55;
const START_MS = 350;

/** Splits text into words that are uncovered one after another, each for as long as it would take to write. */
function written(text: string, startMs: number, cps: number) {
  let at = startMs;
  const words = text.split(" ").map((w, i) => {
    const d = Math.max(140, (w.length / cps) * 1000);
    const el = (
      <span key={i} className="ink" style={{ "--ink-at": `${Math.round(at)}ms`, "--ink-d": `${Math.round(d)}ms` } as React.CSSProperties}>
        {w}
      </span>
    );
    at += d + 40;
    return el;
  });
  return { words, end: at };
}
const spaced = (words: React.ReactNode[]) => words.reduce<React.ReactNode[]>((a, w, i) => (i ? [...a, " ", w] : [w]), []);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** overshoots a little and settles: a ring clunking into its notch */
const backOut = (t: number) => 1 + 2.9 * Math.pow(t - 1, 3) + 1.9 * Math.pow(t - 1, 2);
/** how far each ring turns per unit of scroll while it searches for its notch (deg), inner to outer */
const SEARCH = [900, -640, 420];
/** where a handoff is, 0..1 (unclamped, so callers can tell before from after) */
const handU = (p: number, h: 0 | 1) => (p - T.hand[h][0]) / (T.hand[h][1] - T.hand[h][0]);

const LOCKS = [
  { key: "guard", label: "Guard", n: "I" },
  { key: "you", label: "You", n: "II" },
  { key: "vault", label: "Vault", n: "III" },
] as const;

/**
 * The landing hero: a vault door fills the screen. Scrolling pins it and tells the three locks over the
 * mechanism: Guard's card while the wheel turns, yours as the bolts pull back and the door swings, the Vault's
 * as the camera walks up to the gold. Between locks a card seals and folds into a seam of light, and a combination
 * tumbler rises out of it, turns the next ring home and flies into the next card's medallion as it unfolds.
 * The copy on the left is handwritten in on load.
 * With reduced motion there's no pinning: a still door, the copy, and the three cards as a plain list.
 */
export function Hero() {
  const section = useRef<HTMLElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const cue = useRef<HTMLDivElement>(null);
  const fade = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const stage = useRef<HTMLDivElement>(null);
  const tumbler = useRef<HTMLDivElement>(null);
  const seam = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const [webgl, setWebgl] = useState(true);
  const [go, setGo] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [steps, setSteps] = useState<LockSteps>({ guard: 0, you: 0, vault: 0 });
  const [active, setActive] = useState(-1);

  // Start writing once the script face is in (or after a second, whichever comes first), and not while the
  // intro is still covering the page.
  useEffect(() => {
    let done = false;
    let t = 0;
    const begin = () => !done && ((done = true), setGo(true));
    const ready = () => {
      document.fonts?.load('1em "Parisienne"').then(begin, begin);
      t = window.setTimeout(begin, 1200);
    };
    if (document.documentElement.dataset.intro === "play") window.addEventListener("cp-intro-done", ready, { once: true });
    else ready();
    return () => {
      clearTimeout(t);
      window.removeEventListener("cp-intro-done", ready);
    };
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setReduced(true);
    let raf = 0;
    let prev = performance.now();
    let last = { g: -1, y: -1, v: -1, a: -2 };
    // the plates and their medallions, for the folds and the tumbler's flight
    const card = (i: number) => slots.current[i]?.querySelector<HTMLElement>(".vault-card") ?? null;
    const medal = (i: number) => card(i)?.querySelector<HTMLElement>(".medallion") ?? null;
    const centre = (el: HTMLElement | null) => {
      const r = el?.getBoundingClientRect();
      const o = stage.current?.getBoundingClientRect();
      return r && o ? { x: r.left - o.left + r.width / 2, y: r.top - o.top + r.height / 2, w: r.width } : { x: 0, y: 0, w: 0 };
    };
    let ts = 0;
    // A few frames after mount, paint every card (folded and pressed), the tumbler and the seam once at
    // near-zero opacity, so their first-time raster and shader costs land now rather than mid-scroll.
    let frame = 0;
    const warm = () => {
      slots.current.forEach((s, i) => {
        const el = card(i);
        if (!s || !el) return;
        s.style.visibility = "visible";
        s.style.opacity = "0.002";
        el.style.clipPath = frame % 2 ? "inset(20% -2px 20% -2px round 22px)" : "";
        s.style.setProperty("--press", "0.5");
        s.style.setProperty("--sweep-on", "0.5");
      });
      for (const el of [tumbler.current, seam.current]) {
        if (!el) continue;
        el.style.visibility = "visible";
        el.style.opacity = "0.002";
      }
      tumbler.current?.style.setProperty("--flash", "0.5");
      tumbler.current?.style.setProperty("--l1", "1");
    };
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const el = section.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const target = seg(-r.top, 0, Math.max(1, r.height - window.innerHeight));
        // A little inertia, so the mechanism feels heavy rather than glued to the scrollbar.
        progress.current += (target - progress.current) * (1 - Math.exp(-dt * 7));
        if (Math.abs(target - progress.current) < 1e-4) progress.current = target;
        const p = progress.current;
        if (copy.current) {
          const k = seg(p, ...T.copyOut);
          copy.current.style.opacity = String(1 - k);
          copy.current.style.transform = `translate3d(${-k * 40}px, 0, 0)`;
          copy.current.style.visibility = k >= 1 ? "hidden" : "visible";
        }
        if (cue.current) cue.current.style.opacity = String(1 - seg(p, 0, 0.04));
        if (fade.current) fade.current.style.opacity = String(seg(p, ...T.fade));

        // the three cards. Guard slides in; after that each card folds shut into a seam of light and the next
        // unfolds out of one. Between them the tumbler plays (below).
        const u0 = handU(p, 0), u1 = handU(p, 1);
        const uIn = [null, u0, u1], uOut = [u0, u1, null];
        slots.current.forEach((s, i) => {
          const el = card(i);
          if (!s || !el) return;
          const ui = uIn[i] ?? null, uo = uOut[i] ?? null;
          let opacity = 1, tx = 0, ty = 0, shut = 0;
          if (ui === null) {
            const k = seg(p, T.guard[0], T.guard[0] + 0.03);
            opacity = p < T.guard[0] ? 0 : k;
            tx = -(1 - k) * 36;
            ty = (1 - k) * 10;
          } else shut = 1 - easeInOut(seg(ui, 0.7, 0.9));
          if (uo !== null) shut = Math.max(shut, easeInOut(seg(uo, 0.18, 0.4)));
          s.style.opacity = String(opacity);
          s.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
          s.style.visibility = opacity <= 0 || shut >= 1 ? "hidden" : "visible";
          el.style.clipPath = shut > 0.001 ? `inset(${shut * 50}% -2px ${shut * 50}% -2px round 22px)` : "";
          s.style.setProperty("--spin", String(shut));
          // light runs round the brass edge as a lock completes, and again as the next one settles
          let sw = -1;
          if (uo !== null && uo > 0 && uo < 0.2) sw = seg(uo, 0, 0.2);
          else if (ui !== null && ui > 0.86 && ui < 1) sw = seg(ui, 0.86, 1);
          else if (i === 2 && p > 0.915 && p < 0.94) sw = seg(p, 0.915, 0.94);
          s.style.setProperty("--sweep", String(Math.max(sw, 0)));
          s.style.setProperty("--sweep-on", String(sw <= 0 || sw >= 1 ? 0 : Math.sin(Math.PI * sw)));
          s.style.setProperty("--med", String(ui === null ? 1 : seg(ui, 0.88, 0.95)));
          s.style.setProperty("--press", String(i === 1 ? seg(p, ...T.press) : 0));
        });

        // the handoff: the tumbler rises out of the seam, turns the next ring home, rolls to the next numeral,
        // then flies into the new card's medallion
        const tb = tumbler.current, sm = seam.current;
        const h: 0 | 1 | null = u0 >= 0 && u0 <= 1 ? 0 : u1 >= 0 && u1 <= 1 ? 1 : null;
        if (tb && sm) {
          if (h === null) {
            tb.style.visibility = "hidden";
            sm.style.visibility = "hidden";
          } else {
            const u = h === 0 ? u0 : u1;
            const size = window.innerWidth < 640 ? 176 : 240;
            if (size !== ts) tb.style.setProperty("--ts", `${(ts = size)}px`);
            const from = centre(card(h)), to = centre(card(h + 1)), med = centre(medal(h + 1));
            const rise = easeInOut(seg(u, 0.34, 0.48));
            const travel = easeInOut(seg(u, 0.44, 0.66));
            const settle = easeInOut(seg(u, 0.72, 0.92));
            const core = 46 / (0.25 * size); // the core lands the size of a medallion
            const x = lerp(lerp(from.x, to.x, travel), med.x, settle);
            const y = lerp(lerp(from.y, to.y, travel), med.y, settle);
            const sx = lerp(0.55, 1, rise) * lerp(1, core, settle);
            const sy = lerp(0.03, 1, rise) * lerp(1, core, settle);
            const op = seg(u, 0.33, 0.38) * (1 - seg(u, 0.9, 0.95));
            tb.style.visibility = op > 0 ? "visible" : "hidden";
            tb.style.opacity = String(op);
            tb.style.transform = `translate3d(${x - size / 2}px, ${y - size / 2}px, 0) scale(${sx}, ${sy})`;
            const lockAt = T.hand[h][0] + 0.46 * (T.hand[h][1] - T.hand[h][0]);
            for (let k = 0; k < 3; k++) {
              let ang = SEARCH[k]! * p, lit = 0;
              if (k < h) (ang = 0), (lit = 1);
              else if (k === h) {
                const t = seg(u, 0.46, 0.62);
                if (t > 0) {
                  // keep turning the same way, then clunk into the next notch-up position
                  const a0 = SEARCH[k]! * lockAt;
                  const home = SEARCH[k]! > 0 ? Math.ceil(a0 / 360 + 0.25) * 360 : Math.floor(a0 / 360 - 0.25) * 360;
                  ang = lerp(a0, home, backOut(t));
                }
                lit = seg(u, 0.6, 0.63);
              }
              tb.style.setProperty(`--a${k + 1}`, `${ang.toFixed(2)}deg`);
              tb.style.setProperty(`--l${k + 1}`, lit.toFixed(3));
            }
            tb.style.setProperty("--num", String(h + easeInOut(seg(u, 0.62, 0.74))));
            tb.style.setProperty("--flash", String(seg(u, 0.6, 0.63) * (1 - seg(u, 0.63, 0.8))));
            tb.style.setProperty("--rings", String(1 - seg(u, 0.74, 0.88)));
            // the seam: flares out of the folding card, then draws back into the next one as it opens
            const vw = window.innerWidth;
            const out = seg(u, 0.26, 0.36) * (1 - seg(u, 0.46, 0.58));
            const back = seg(u, 0.62, 0.7) * (1 - seg(u, 0.8, 0.9));
            const at = out >= back ? from : to;
            const span = out >= back ? lerp(from.w / vw, 1.1, easeInOut(seg(u, 0.28, 0.44))) : lerp(1.1, to.w / vw, easeInOut(seg(u, 0.64, 0.78)));
            sm.style.visibility = Math.max(out, back) > 0 ? "visible" : "hidden";
            sm.style.opacity = String(Math.max(out, back));
            sm.style.transform = `translate3d(${at.x - vw / 2}px, ${at.y}px, 0) scaleX(${span})`;
          }
        }
        const a = p < T.guard[0] ? -1 : u0 < 0.7 ? 0 : u1 < 0.7 ? 1 : 2;
        if (rail.current) {
          rail.current.style.opacity = String(seg(p, 0.06, 0.09) * (1 - seg(p, 0.97, 1)));
          rail.current.style.setProperty("--r1", String(seg(p, T.rail[0], T.rail[1])));
          rail.current.style.setProperty("--r2", String(seg(p, T.rail[2], T.rail[3])));
        }
        const g = passed(p, T.guardSteps), y = passed(p, T.youSteps), v = passed(p, T.vaultSteps);
        if (g !== last.g || y !== last.y || v !== last.v) setSteps({ guard: g, you: y, vault: v });
        if (a !== last.a) setActive(a);
        last = { g, y, v, a };
        // the next frame's pass resets everything warm() touched
        if (++frame >= 20 && frame < 24 && p < T.guard[0]) warm();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const h1 = written(HEADLINE[0]!, START_MS, HEAD_CPS);
  const h2 = written(HEADLINE[1]!, h1.end + 120, HEAD_CPS);
  const body = written(BODY, h2.end + 260, BODY_CPS);
  const after = Math.round(body.end + 150);
  const cards = [<GuardCard key="g" step={steps.guard} />, <YouCard key="y" step={steps.you} />, <VaultCard key="v" step={steps.vault} />];

  return (
    <>
      <section
        id="vault-hero"
        ref={section}
        aria-label="Checkpoint"
        // Full-bleed, tucked up under the floating nav. The extra height is the scroll that opens the door.
        className={`relative -mt-[101px] md:-mt-[60px] ${reduced ? "h-svh" : "h-[600svh]"}`}
        style={{ marginLeft: "calc(50% - 50vw)", width: "100vw" }}
      >
        <div ref={stage} className="sticky top-0 h-svh overflow-hidden bg-[#050506]">
          {webgl ? (
            <VaultDoor progress={progress} onUnsupported={() => setWebgl(false)} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/vault-door.jpg" alt="" className="absolute inset-0 size-full object-cover object-[70%_50%]" />
          )}
          {/* keep the copy legible over the wall */}
          <div ref={copy} className="absolute inset-0">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgb(4_4_6/0.82)_0%,rgb(4_4_6/0.55)_36%,transparent_62%)] max-lg:bg-[linear-gradient(0deg,rgb(4_4_6/0.92)_0%,rgb(4_4_6/0.8)_45%,rgb(4_4_6/0.15)_72%,transparent_100%)]" />
            <div className="relative mx-auto flex h-full w-full max-w-7xl items-center px-4 pt-24 max-lg:items-end max-lg:pb-24 sm:px-6 lg:px-8">
              <div className={`max-w-[34rem] ${go ? "ink-go" : ""}`}>
                <p className="hero-rise inline-flex items-center gap-2 rounded-full bg-[rgb(10_10_12/0.55)] py-1 pr-3 pl-1.5 text-[12px] text-[#c9c0ae] ring-1 ring-[rgb(227_180_94/0.25)] backdrop-blur">
                  <span className="rounded-full bg-[rgb(227_180_94/0.14)] px-2 py-0.5 font-engrave text-[10px] font-semibold tracking-[0.16em] text-[#e3b45e] uppercase">NEAR Hackathon 2026</span>
                  AI Security &amp; Defense
                </p>
                <h1 className="mt-5 font-script text-[clamp(2.6rem,4.5vw,4.6rem)] leading-[1.08] font-normal tracking-normal whitespace-nowrap text-[#f4ead6] max-sm:mt-3 max-sm:text-[2.3rem] max-sm:whitespace-normal">
                  <span className="block">{spaced(h1.words)}</span>
                  <span className="block text-[#e3b45e]">{spaced(h2.words)}</span>
                </h1>
                <p className="mt-5 font-script text-[clamp(1.45rem,2.1vw,1.85rem)] leading-[1.4] text-[#ddd3bf] max-sm:mt-3 max-sm:text-[1.22rem] max-sm:leading-[1.38]">{spaced(body.words)}</p>
                <div
                  className={`mt-8 flex flex-wrap items-center gap-3 max-sm:mt-5 max-sm:gap-2 max-sm:[&>a]:h-11 max-sm:[&>a]:px-4 max-sm:[&>a]:text-sm ${go ? "hero-rise" : "opacity-0"}`}
                  style={{ animationDelay: `${after}ms` }}
                >
                  <Link href="/desk" className="key key-primary h-12 px-6 text-[15px]">
                    Open the desk <ArrowRight aria-hidden className="size-4" />
                  </Link>
                  <Link href="#refusals" className="key h-12 bg-[rgb(10_10_12/0.55)] px-6 text-[15px] text-[#f4ead6] ring-1 ring-[rgb(255_255_255/0.16)] backdrop-blur hover:ring-[rgb(227_180_94/0.5)]">
                    <ShieldAlert aria-hidden className="size-4" /> What it refuses
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {!reduced && (
            <>
              {/* the three locks, told over the mechanism */}
              <h2 className="sr-only">Three locks, each one sees the others&apos; work</h2>
              {cards.map((card, i) => (
                <div
                  key={i}
                  ref={(el) => {
                    slots.current[i] = el;
                  }}
                  aria-hidden={active !== i}
                  style={{ opacity: 0, visibility: "hidden" }}
                  className={`pointer-events-none absolute inset-0 mx-auto flex w-full max-w-7xl items-center px-4 pt-24 max-lg:items-end max-lg:pb-5 sm:px-6 lg:px-8 ${
                    i === 2 ? "justify-end" : "justify-start"
                  }`}
                >
                  <div className={`w-[min(30rem,100%)] ${active === i ? "pointer-events-auto" : ""}`}>{card}</div>
                </div>
              ))}

              <div ref={seam} aria-hidden className="hand-seam" style={{ visibility: "hidden" }} />
              <Tumbler ref={tumbler} />

              <div
                ref={rail}
                aria-hidden
                style={{ opacity: 0 }}
                className="pointer-events-none absolute inset-x-0 bottom-7 flex justify-center max-lg:top-[112px] max-lg:bottom-auto md:max-lg:top-[80px]"
              >
                <ol className="nav-plate flex items-center gap-2 rounded-full px-3 py-1.5">
                  {LOCKS.map((l, i) => (
                    <li key={l.key} className="flex items-center gap-2">
                      {i > 0 && (
                        <span className="relative h-px w-10 overflow-hidden bg-[rgb(255_236_200/0.14)] max-sm:w-5">
                          <span className="lock-rail-fill absolute inset-0" style={{ "--rail": `var(--r${i})` } as React.CSSProperties} />
                        </span>
                      )}
                      <span
                        className={`flex items-center gap-1.5 font-engrave text-[11px] font-semibold tracking-[0.18em] uppercase transition-colors duration-500 ${
                          i <= active ? "text-[#f0cf8a]" : "text-[#8c8477]"
                        }`}
                      >
                        <span className="text-[10px] opacity-70">{l.n}</span> {l.label}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div ref={cue} className="absolute inset-x-0 bottom-9 flex flex-col items-center gap-1.5 text-[#c9c0ae]">
                <span className="font-engrave text-[11px] font-semibold tracking-[0.24em] uppercase">Scroll to open the vault</span>
                <ChevronDown aria-hidden className="size-4 animate-bounce" />
              </div>
            </>
          )}
          {/* the bottom of the vault melts into the page, so the next section rises out of it */}
          <div ref={fade} aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,transparent_45%,var(--color-bg)_100%)] opacity-0" />
        </div>
      </section>

      {reduced && (
        <section aria-labelledby="locks-title" className="py-20">
          <p className="eyebrow">How it works</p>
          <h2 id="locks-title" className="display mt-4 text-5xl text-fg">
            Three locks. <span className="gilt italic">Each one sees the others&apos; work.</span>
          </h2>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            <GuardCard step={ALL_DONE.guard} />
            <YouCard step={ALL_DONE.you} />
            <VaultCard step={ALL_DONE.vault} />
          </div>
        </section>
      )}
    </>
  );
}
