"use client";

import { Check, LockKeyhole, LockKeyholeOpen, ScanSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { DEMO_HASH } from "@/lib/demo";
import { shortHash } from "@/lib/format";
import { VaultDialFallback } from "./vault-dial";
import { VaultScene } from "./vault-scene";

const LOCKS = ["Guard", "You", "Vault"] as const;

const STATUS = [
  { Icon: ScanSearch, title: "Agents researching", sub: "4 items · 18 offers from snapshot v0" },
  { Icon: LockKeyholeOpen, title: "Guard signed the basket", sub: "3 offers blocked · 5 flagged for review" },
  { Icon: LockKeyholeOpen, title: `You approved ${shortHash(DEMO_HASH, 4)}`, sub: "exact basket · 1 yocto · full-access key" },
  { Icon: LockKeyhole, title: "Vault settled 81.66 cpUSD", sub: "2 payouts done · 1 refunded exactly once" },
];
/** Each lock gets enough time for its ring to travel, clunk home and light its seam. */
const PHASE_MS = [3000, 2600, 2600, 5200];

/** The hero centrepiece: the WebGL vault (or its SVG stand-in) plus the HUD that narrates the run. */
export function VaultStage() {
  const [phase, setPhase] = useState(0);
  const [webgl, setWebgl] = useState(true);

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
    <div className="relative mx-auto w-full max-w-[600px]">
      {/* lock legend at the index */}
      <ol className="relative z-10 mb-2 flex justify-center gap-1.5" aria-label="Locks">
        {LOCKS.map((l, i) => (
          <li
            key={l}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.16em] uppercase ring-1 ring-inset transition-all duration-700 ${
              phase > i ? "bg-accent-soft text-accent ring-accent/35 shadow-[0_0_24px_-6px_var(--color-accent)]" : "text-faint ring-line"
            }`}
          >
            {phase > i ? <Check aria-hidden className="size-3" /> : <span className="size-1 rounded-full bg-current" />}
            {l}
          </li>
        ))}
      </ol>

      <div className="relative aspect-square w-full">
        {/* contact light under the mechanism */}
        <div aria-hidden className="absolute inset-x-[12%] bottom-[6%] h-[18%] rounded-[50%] bg-black/60 blur-3xl light:bg-[rgb(16_24_40/0.18)]" />
        <div
          aria-hidden
          className={`absolute inset-[26%] rounded-full bg-accent/15 blur-[80px] transition-opacity duration-[1500ms] ${phase === 3 ? "opacity-100" : "opacity-0"}`}
        />
        {webgl ? (
          <VaultScene state={{ locked: [phase >= 1, phase >= 2, phase >= 3], settled: phase === 3 }} onUnsupported={() => setWebgl(false)} />
        ) : (
          <VaultDialFallback phase={phase} />
        )}

        <Chip on={phase >= 1} className="top-[13%] -left-[3%] animate-float" tone="bad" k="BLOCK" text="Cloudflare R2 · 188% of median" />
        <Chip on={phase >= 1} className="top-[47%] -left-[10%] animate-float-slow [animation-delay:-3s]" tone="warn" k="REVIEW" text="OVHcloud VPS · 19% of median" />
        <Chip on={phase >= 2} className="top-[17%] -right-[5%] animate-float-slow [animation-delay:-2s]" tone="ok" k="APPROVED" text={`hash ${shortHash(DEMO_HASH, 4)}`} />
        <Chip on={phase >= 3} className="bottom-[22%] -right-[7%] animate-float [animation-delay:-1s]" tone="ok" k="PAID" text="59.71 cpUSD → vendor-02" />
        <Chip on={phase >= 3} className="bottom-[7%] left-[0%] animate-float-slow [animation-delay:-5s]" tone="warn" k="REFUNDED" text="vendor-06 can't receive · 6.95 back" />
      </div>

      {/* status plate */}
      <div className="glass relative z-10 mx-auto -mt-2 flex w-fit max-w-full items-center gap-3 rounded-2xl py-2.5 pr-4 pl-3" aria-live="polite">
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset transition-colors duration-700 ${phase === 3 ? "bg-accent-soft text-accent ring-accent/30" : "text-steel ring-line"}`}>
          <Icon aria-hidden className="size-4.5" />
        </span>
        <span className="min-w-0">
          <span key={title} className="block text-[13.5px] font-medium text-fg animate-[fade-up_500ms_var(--ease-out-soft)]">{title}</span>
          <span className="block truncate font-mono text-[10.5px] text-muted">{sub}</span>
        </span>
        <span className="ml-2 flex gap-1" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-1 rounded-full transition-all duration-500 ${i === phase ? "w-5 bg-accent" : i < phase ? "w-1.5 bg-accent/50" : "w-1.5 bg-line-strong"}`} />
          ))}
        </span>
      </div>
    </div>
  );
}

function Chip({ on, className, tone, k, text }: { on: boolean; className: string; tone: "ok" | "warn" | "bad"; k: string; text: string }) {
  const dot = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" }[tone];
  const key = { ok: "text-ok", warn: "text-warn", bad: "text-bad" }[tone];
  return (
    <div data-on={on} className={`dial-chip absolute z-10 hidden sm:block ${className}`}>
      <div className="glass flex items-center gap-2 rounded-full py-1.5 pr-3 pl-2.5 text-[11.5px] whitespace-nowrap">
        <span className={`size-1.5 rounded-full ${dot} ${on ? "animate-pulse-dot" : ""}`} style={{ color: "currentColor" }} />
        <span className={`font-mono text-[10px] tracking-[0.12em] ${key}`}>{k}</span>
        <span className="text-fg/85">{text}</span>
      </div>
    </div>
  );
}
