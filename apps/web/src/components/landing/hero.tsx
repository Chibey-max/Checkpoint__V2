import { ArrowRight, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { VaultStage } from "./vault-stage";

export function Hero() {
  return (
    <section className="relative grid grid-cols-1 items-center gap-10 pt-16 pb-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-6 lg:pt-24">
      <div className="relative z-10">
        <p className="hero-rise glass inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1.5 text-[12px] text-muted">
          <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-accent uppercase ring-1 ring-inset ring-accent/25">
            NEAR Hackathon 2026
          </span>
          AI Security &amp; Defense
        </p>
        <h1 className="mt-6 text-[clamp(2.75rem,6vw,4.75rem)] leading-[0.98] font-semibold text-fg">
          <Word i={0}>Your</Word> <Word i={1}>agents</Word> <Word i={2}>shop.</Word>
          <br />
          <span
            className="inline-block font-serif font-normal tracking-[-0.02em] text-transparent bg-clip-text bg-[linear-gradient(100deg,var(--color-fg)_10%,var(--color-accent)_50%,var(--color-fg)_90%)] bg-[length:220%_100%]"
            style={{ animation: "word-in 900ms var(--ease-out-soft) 300ms both, sheen 10s ease-in-out 1.4s infinite" }}
          >
            Three locks
          </span>{" "}
          <Word i={4}>decide.</Word>
        </h1>
        <p className="hero-rise mt-6 max-w-xl text-[17px] leading-relaxed text-muted" style={{ animationDelay: "520ms" }}>
          Agents research real offers and build a basket. Guard checks every price against the market and signs only that basket. You approve
          its exact hash from your wallet. Then the Vault contract checks caps, allowlists and expiry before a single cpUSD moves.
        </p>
        <div className="hero-rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "640ms" }}>
          <Link href="/desk" className="key key-primary h-12 px-6 text-[15px]">
            Open the desk <ArrowRight aria-hidden className="size-4" />
          </Link>
          <Link href="#refusals" className="key key-secondary h-12 px-6 text-[15px]">
            <ShieldAlert aria-hidden className="size-4" /> What it refuses
          </Link>
        </div>
        <dl style={{ animationDelay: "760ms" }} className="hero-rise mt-10 grid max-w-lg grid-cols-3 divide-x divide-line rounded-2xl border border-line">
          {[
            ["18", "real offers in the snapshot"],
            ["29", "ways the Vault can say no"],
            ["1 yocto", "makes your wallet sign for real"],
          ].map(([v, l]) => (
            <div key={l} className="min-w-0 px-3 py-3 sm:px-4">
              <dt className="sr-only">{l}</dt>
              <dd className="text-lg font-semibold text-fg tabular sm:text-xl">{v}</dd>
              <dd className="mt-0.5 text-[11px] leading-snug text-muted sm:text-[11.5px]">{l}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="relative">
        <VaultStage />
        <p className="mt-3 text-center font-mono text-[10px] tracking-[0.14em] text-faint uppercase">Illustration · prices from snapshot v0, 5 Nov</p>
      </div>
    </section>
  );
}

function Word({ i, children }: { i: number; children: React.ReactNode }) {
  return (
    <span className="hero-word inline-block" style={{ animationDelay: `${120 + i * 90}ms` }}>
      {children}
    </span>
  );
}
