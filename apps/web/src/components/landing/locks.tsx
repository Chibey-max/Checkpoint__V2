import { Check, Fingerprint, KeyRound, Landmark, ShieldCheck, Wallet } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { TrustLabel } from "@/components/trust-label";
import { VPS_OFFERS } from "@/lib/demo";
import { RatioBar } from "./product-window";
import { DEMO_HASH } from "@/lib/demo";
import { shortHash } from "@/lib/format";

export function Locks() {
  return (
    <section aria-labelledby="locks-title" className="py-24">
      <Reveal className="max-w-2xl">
        <p className="eyebrow">How it works</p>
        <h2 id="locks-title" className="mt-3 text-4xl font-semibold text-fg sm:text-5xl">
          Three locks. <span className="font-serif font-normal text-muted">Each one sees the others&apos; work.</span>
        </h2>
        <p className="mt-4 text-[16px] leading-relaxed text-muted">
          No single part can move money on its own. A compromised agent, a buggy Guard or a forged basket each hits a lock it can&apos;t open.
        </p>
      </Reveal>

      <ol className="mt-12 grid gap-5 lg:grid-cols-3">
        <LockCard n="01" Icon={ShieldCheck} name="Guard" kind="advisory" delay={0}
          body="A deterministic rules engine. It loads offers itself, never trusting prices from the agents, compares each to the market median, and signs only the exact basket it checked.">
          <div className="space-y-2.5">
            <p className="flex justify-between font-mono text-[10px] tracking-wider text-faint uppercase">
              <span>VPS 2 vCPU / 4 GB</span>
              <span>median $24.00</span>
            </p>
            {VPS_OFFERS.slice(0, 4).map((o) => (
              <div key={o.seller} className="grid grid-cols-[88px_1fr] items-center gap-3 text-[12px]">
                <span className="truncate text-muted">{o.seller}</span>
                <RatioBar bps={o.bps} level={o.level} />
              </div>
            ))}
            <p className="flex gap-3 pt-1 font-mono text-[9.5px] tracking-wider text-faint uppercase">
              <span className="text-warn">&lt;50% review</span>
              <span className="text-ok">50–105% allow</span>
              <span className="text-bad">&gt;120% block</span>
            </p>
          </div>
        </LockCard>

        <LockCard n="02" Icon={Wallet} name="You" kind="onchain" delay={120}
          body="Your wallet approves the sha256 of the exact basket bytes, with 1 yocto attached so it must use a full-access key. Change one vendor or one unit and the approval no longer matches.">
          <div className="rounded-xl border border-line bg-[color-mix(in_srgb,var(--color-bg)_45%,transparent)] p-3">
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-1.5 text-fg">
                <KeyRound aria-hidden className="size-3.5 text-accent" /> Wallet request
              </span>
              <span className="font-mono text-[10px] text-faint">testnet</span>
            </div>
            <dl className="mt-2.5 space-y-1.5 font-mono text-[11px]">
              {[
                ["contract", "vault.cpdemo.testnet"],
                ["method", "approve_basket"],
                ["hash_hex", shortHash(DEMO_HASH, 7)],
                ["deposit", "1 yocto"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-faint">{k}</dt>
                  <dd className="truncate text-fg">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <span className="key key-secondary h-8 text-[12px]">Reject</span>
              <span className="key key-primary h-8 text-[12px]">
                <Fingerprint aria-hidden className="size-3.5" /> Approve
              </span>
            </div>
          </div>
        </LockCard>

        <LockCard n="03" Icon={Landmark} name="Vault" kind="onchain" delay={240}
          body="A Rust contract holding the cpUSD. It re-checks Guard's signature, your approval, the vendor and token allowlists, caps and expiry, then pays each vendor and settles from callbacks only.">
          <div>
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="text-muted">Today&apos;s cap</span>
              <span className="font-mono text-fg tabular">81.66 / 300.00</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-fg)_7%,transparent)]">
              <div className="h-full w-[27%] rounded-full bg-[linear-gradient(90deg,var(--color-accent-strong),var(--color-accent))]" />
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
              {["Guard signature", "Your approval", "Vendor allowlist", "Token allowlist", "Basket + daily cap", "Expiry + replay"].map((c) => (
                <li key={c} className="flex items-center gap-1.5 text-muted">
                  <Check aria-hidden className="size-3.5 text-accent" /> {c}
                </li>
              ))}
            </ul>
          </div>
        </LockCard>
      </ol>
    </section>
  );
}

function LockCard({ n, Icon, name, kind, body, delay, children }: {
  n: string; Icon: typeof ShieldCheck; name: string; kind: "onchain" | "advisory"; body: string; delay: number; children: React.ReactNode;
}) {
  return (
    <Reveal as="li" delay={delay} className="panel edge-light flex flex-col rounded-[var(--radius-card)] p-6" spotlight>
      <div className="flex items-start justify-between">
        <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent ring-1 ring-inset ring-accent/25">
          <Icon aria-hidden className="size-5" />
        </span>
        <span className="font-mono text-[11px] text-faint">LOCK {n}</span>
      </div>
      <div className="mt-5 flex items-center gap-2">
        <h3 className="text-2xl font-semibold text-fg">{name}</h3>
        <TrustLabel kind={kind} />
      </div>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">{body}</p>
      <div className="mt-6 border-t border-line pt-5">{children}</div>
    </Reveal>
  );
}
