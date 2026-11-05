"use client";

import { Check, LockKeyhole, LockKeyholeOpen, ScanSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { shortHash } from "@/lib/format";
import { DEMO_HASH } from "@/lib/demo";

/** Ring order matches the flow: Guard checks first (inner), then you, then the Vault (outer). */
const RINGS = [
  { key: "guard", label: "Guard", r: 108, spin: "animate-[spin_38s_linear_infinite]" },
  { key: "you", label: "You", r: 156, spin: "animate-[spin-rev_52s_linear_infinite]" },
  { key: "vault", label: "Vault", r: 204, spin: "animate-[spin_70s_linear_infinite]" },
] as const;

const STATUS = [
  { Icon: ScanSearch, title: "Agents found 18 offers", sub: "researching · 4 items" },
  { Icon: LockKeyholeOpen, title: "Guard signed the basket", sub: "3 blocked · 5 flagged" },
  { Icon: LockKeyholeOpen, title: `You approved ${shortHash(DEMO_HASH, 4)}`, sub: "exact basket · 1 yocto" },
  { Icon: LockKeyhole, title: "Vault settled 81.66 cpUSD", sub: "2 paid · 1 refunded" },
];
const PHASE_MS = [2600, 2200, 2200, 3800];

export function VaultDial() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase(3);
      return;
    }
    const t = setTimeout(() => setPhase((p) => (p + 1) % 4), PHASE_MS[phase]);
    return () => clearTimeout(t);
  }, [phase]);

  const { Icon, title, sub } = STATUS[phase]!;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[540px]">
      {/* bezel */}
      <div className="dial-bezel absolute inset-[4%] rounded-full" />
      <div className="dial-face absolute inset-[7.5%] rounded-full" />

      <svg viewBox="-250 -250 500 500" className="absolute inset-0 size-full" aria-hidden>
        {RINGS.map((ring, i) => {
          const locked = phase > i;
          const c = 2 * Math.PI * ring.r;
          return (
            <g key={ring.key} className={locked ? "dial-locked" : ""}>
              <g className={`dial-ring ${ring.spin}`}>
                <circle r={ring.r} fill="none" strokeWidth="20" style={{ stroke: "var(--color-line)" }} />
                <circle r={ring.r} fill="none" strokeWidth="9" style={{ stroke: "var(--color-faint)", strokeOpacity: 0.55, strokeDasharray: `1.2 ${c / 90 - 1.2}` }} />
                <circle
                  r={ring.r}
                  fill="none"
                  strokeWidth="3"
                  strokeLinecap="round"
                  transform="rotate(-90)"
                  className="dial-arc"
                  style={{
                    stroke: locked ? "var(--color-accent)" : "var(--color-steel)",
                    strokeOpacity: locked ? 1 : 0.5,
                    strokeDasharray: locked ? `${c} 0` : `${c * 0.14} ${c}`,
                  }}
                />
                <rect
                  x="-3.5"
                  y={-ring.r - 15}
                  width="7"
                  height="30"
                  rx="3.5"
                  className="transition-[fill] duration-500"
                  style={{ fill: locked ? "var(--color-accent)" : "var(--color-steel)" }}
                />
              </g>
            </g>
          );
        })}
        {/* the gate: notches line up here when a ring locks */}
        <path d="M -7 -246 L 7 -246 L 0 -234 Z" style={{ fill: "var(--color-accent)" }} />
      </svg>

      {/* centre readout */}
      <div className="absolute inset-[34%] grid place-items-center rounded-full glass">
        <div className="px-2 text-center" aria-live="polite">
          <Icon aria-hidden className={`mx-auto size-6 transition-colors ${phase === 3 ? "text-accent" : "text-steel"}`} />
          <p key={title} className="mt-1.5 text-[11.5px] leading-tight font-medium text-fg animate-[fade-up_500ms_var(--ease-out-soft)] sm:text-[13px]">
            {title}
          </p>
          <p className="mt-1 font-mono text-[9.5px] tracking-wider text-muted uppercase sm:text-[10px]">{sub}</p>
        </div>
      </div>

      {/* ring legend at the gate */}
      <ol className="absolute -top-[5%] left-1/2 flex -translate-x-1/2 gap-1.5">
        {RINGS.map((ring, i) => (
          <li
            key={ring.key}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9.5px] tracking-[0.14em] uppercase ring-1 ring-inset transition-colors duration-500 ${
              phase > i ? "bg-accent-soft text-accent ring-accent/30" : "text-faint ring-line"
            }`}
          >
            {phase > i ? <Check aria-hidden className="size-2.5" /> : <span className="size-1 rounded-full bg-current" />}
            {ring.label}
          </li>
        ))}
      </ol>

      {/* event chips */}
      <Chip on={phase >= 1} className="top-[16%] -left-[4%] animate-float" tone="bad" k="BLOCK" text="Cloudflare R2 · 188% of median" />
      <Chip on={phase >= 1} className="top-[50%] -left-[9%] animate-float-slow [animation-delay:-3s]" tone="warn" k="REVIEW" text="OVHcloud VPS · 19% of median" />
      <Chip on={phase >= 2} className="top-[20%] -right-[6%] animate-float-slow [animation-delay:-2s]" tone="ok" k="APPROVED" text={`hash ${shortHash(DEMO_HASH, 4)}`} />
      <Chip on={phase >= 3} className="bottom-[19%] -right-[3%] animate-float [animation-delay:-1s]" tone="ok" k="PAID" text="59.71 cpUSD → vendor-02" />
      <Chip on={phase >= 3} className="bottom-[6%] left-[2%] animate-float-slow [animation-delay:-5s]" tone="warn" k="REFUNDED" text="vendor-06 can't receive · 6.95 back once" />
    </div>
  );
}

function Chip({ on, className, tone, k, text }: { on: boolean; className: string; tone: "ok" | "warn" | "bad"; k: string; text: string }) {
  const dot = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" }[tone];
  const key = { ok: "text-ok", warn: "text-warn", bad: "text-bad" }[tone];
  return (
    <div data-on={on} className={`dial-chip absolute hidden sm:block ${className}`}>
      <div className="glass flex items-center gap-2 rounded-full py-1.5 pr-3 pl-2.5 text-[11.5px] whitespace-nowrap">
        <span className={`size-1.5 rounded-full ${dot}`} />
        <span className={`font-mono text-[10px] tracking-[0.12em] ${key}`}>{k}</span>
        <span className="text-fg/85">{text}</span>
      </div>
    </div>
  );
}
