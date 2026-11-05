import { ArrowRight, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { VaultDial } from "./vault-dial";

export function Hero() {
  return (
    <section className="relative grid items-center gap-10 pt-16 pb-10 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:pt-24">
      <div className="relative z-10">
        <p className="glass inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1.5 text-[12px] text-muted">
          <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-accent uppercase ring-1 ring-inset ring-accent/25">
            NEAR Hackathon 2026
          </span>
          AI Security &amp; Defense
        </p>
        <h1 className="mt-6 text-[clamp(2.75rem,6vw,4.75rem)] leading-[0.98] font-semibold text-fg">
          Your agents shop.
          <br />
          <span className="font-serif font-normal tracking-[-0.02em] text-transparent bg-clip-text bg-[linear-gradient(100deg,var(--color-fg)_10%,var(--color-accent)_55%,var(--color-fg)_95%)]">
            Three locks
          </span>{" "}
          decide.
        </h1>
        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted">
          Agents research real offers and build a basket. Guard checks every price against the market and signs only that basket. You approve
          its exact hash from your wallet. Then the Vault contract checks caps, allowlists and expiry before a single cpUSD moves.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/desk" className="key key-primary h-12 px-6 text-[15px]">
            Open the desk <ArrowRight aria-hidden className="size-4" />
          </Link>
          <Link href="#refusals" className="key key-secondary h-12 px-6 text-[15px]">
            <ShieldAlert aria-hidden className="size-4" /> What it refuses
          </Link>
        </div>
        <dl className="mt-10 grid max-w-lg grid-cols-3 divide-x divide-line rounded-2xl border border-line">
          {[
            ["18", "real offers in the snapshot"],
            ["29", "ways the Vault can say no"],
            ["1 yocto", "makes your wallet sign for real"],
          ].map(([v, l]) => (
            <div key={l} className="px-4 py-3">
              <dt className="sr-only">{l}</dt>
              <dd className="text-xl font-semibold text-fg tabular">{v}</dd>
              <dd className="mt-0.5 text-[11.5px] leading-snug text-muted">{l}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="relative">
        <div className="pt-8"><VaultDial /></div>
        <p className="mt-2 text-center font-mono text-[10px] tracking-[0.14em] text-faint uppercase">Illustration · prices from snapshot v0, 5 Nov</p>
      </div>
    </section>
  );
}
