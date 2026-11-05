import { ArrowDownToLine, ArrowUpFromLine, Bot, Gauge, Landmark } from "lucide-react";
import { Ghost, PageHeader, Planned } from "@/components/page-header";
import { TrustLabel } from "@/components/trust-label";

const TILES = [
  { label: "Available", hint: "Spendable by approved baskets" },
  { label: "Reserved", hint: "Locked for payouts in flight" },
  { label: "Withdrawing", hint: "On its way back to you" },
];

export default function VaultPage() {
  return (
    <>
      <PageHeader eyebrow="Vault · cpUSD" title="Your vault" intro="cpUSD held by the Vault contract. Agents can spend it only through baskets you approve, inside your caps.">
        <TrustLabel kind="onchain" />
      </PageHeader>
      <Planned task="P-1.2" needs="H5 · Vault on testnet" title="Live balances arrive with the Vault deploy" Icon={Landmark}>
        Balances, deposit, withdraw and agent authorisation read straight from <code className="font-mono text-fg">vault.cpdemo.testnet</code>. Until Isaac
        deploys it, this page shows its layout.
      </Planned>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {TILES.map((t) => (
          <div key={t.label} className="panel rounded-[var(--radius-card)] p-5">
            <p className="eyebrow">{t.label}</p>
            <p className="mt-3 text-3xl font-semibold text-faint tabular">—.— <span className="text-base font-normal">cpUSD</span></p>
            <p className="mt-2 text-xs text-muted">{t.hint}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="panel rounded-[var(--radius-card)] p-5">
          <div className="flex gap-2">
            <span className="key key-secondary h-9 px-4 text-[13px]"><ArrowDownToLine aria-hidden className="size-4" /> Deposit</span>
            <span className="key key-ghost h-9 px-4 text-[13px]"><ArrowUpFromLine aria-hidden className="size-4" /> Withdraw</span>
          </div>
          <Ghost className="mt-5 h-12" />
          <div className="mt-3 flex gap-2">{[25, 50, 100].map((v) => <Ghost key={v} className="h-8 w-16" />)}</div>
          <Ghost className="mt-5 h-11 w-40 rounded-full" />
        </div>
        <div className="space-y-4">
          <div className="panel rounded-[var(--radius-card)] p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-fg"><Gauge aria-hidden className="size-4 text-accent" /> Limits today</p>
            <Ghost className="mt-4 h-2 rounded-full" />
            <div className="mt-3 flex justify-between"><Ghost className="h-3 w-24" /><Ghost className="h-3 w-16" /></div>
          </div>
          <div className="panel rounded-[var(--radius-card)] p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-fg"><Bot aria-hidden className="size-4 text-accent" /> Settlement agent</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="font-mono text-xs text-muted">agent.cpdemo.testnet</span>
              <Ghost className="h-6 w-11 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
