import Link from "next/link";
import { ArrowRight, Bot, ShieldCheck, UserCheck, Vault } from "lucide-react";
import { TrustLabel } from "@/components/trust-label";
import { VerdictBadge } from "@/components/verdict-badge";

const LOCKS = [
  {
    n: 1,
    Icon: ShieldCheck,
    name: "Guard",
    where: "Off-chain rules engine",
    body: "Checks every offer against published rules (price vs. median, allowlist, duplicates, spec) and signs only the exact basket it checked.",
    label: <TrustLabel kind="advisory" />,
  },
  {
    n: 2,
    Icon: UserCheck,
    name: "You",
    where: "Wallet signature",
    body: "You approve the hash of that exact basket from your own wallet. Change one vendor or one unit and the approval no longer matches.",
    label: <TrustLabel kind="onchain" />,
  },
  {
    n: 3,
    Icon: Vault,
    name: "Vault",
    where: "NEAR smart contract",
    body: "Re-checks the signature, your approval, caps, allowlists and expiry, then pays each vendor. The agent's key can do nothing else.",
    label: <TrustLabel kind="onchain" />,
  },
];

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="grid gap-8 pt-4 md:grid-cols-[1.3fr_1fr] md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-blue">Procurement Desk on Checkpoint</p>
          <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-tight text-navy sm:text-5xl">
            Let AI agents shop. <br />
            Keep the money behind three locks.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Paste a shopping list. Agents find offers, Guard checks every price, you approve the exact basket, and the Vault enforces your limits on NEAR.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/desk" className="inline-flex items-center gap-2 rounded-md bg-blue px-4 py-2.5 font-medium text-white hover:bg-blue/90">
              Open desk <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link href="/vault" className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-4 py-2.5 font-medium text-navy hover:border-navy/30">
              Fund your vault
            </Link>
          </div>
        </div>
        <ExampleVerdicts />
      </section>

      <section aria-labelledby="locks">
        <h2 id="locks" className="text-sm font-semibold uppercase tracking-wider text-muted">The three locks</h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {LOCKS.map(({ n, Icon, name, where, body, label }) => (
            <li key={name} className="relative rounded-lg border border-line bg-white p-5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-md bg-navy text-white">
                    <Icon aria-hidden className="size-4" />
                  </span>
                  <span>
                    <span className="block text-xs text-muted">Lock {n}</span>
                    <span className="block font-semibold text-navy">{name}</span>
                  </span>
                </span>
                {label}
              </div>
              <p className="mt-1 text-xs font-medium text-muted">{where}</p>
              <p className="mt-3 text-sm leading-relaxed">{body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          <Bot aria-hidden className="size-4" />
          Agents propose. They never hold your funds and can only call one method with one key.
        </p>
      </section>
    </div>
  );
}

/** Static illustration of the offers table, using rows from the real snapshot. */
function ExampleVerdicts() {
  const rows = [
    { seller: "Amazon Web Services", item: "VPS 2 vCPU / 4 GB", price: "$24.00", ratio: "100%", level: "ALLOW" as const },
    { seller: "OVHcloud", item: "VPS 2 vCPU / 4 GB", price: "$4.54", ratio: "19%", level: "REVIEW" as const },
    { seller: "Cloudflare", item: "Object storage 1 TB", price: "$15.00", ratio: "188%", level: "BLOCK" as const },
  ];
  return (
    <figure className="rounded-lg border border-line bg-white p-4 shadow-sm">
      <figcaption className="mb-3 text-xs font-medium text-muted">What Guard tells you, per offer</figcaption>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="pb-2 font-medium">Offer</th>
            <th className="pb-2 text-right font-medium">Price</th>
            <th className="pb-2 text-right font-medium">vs median</th>
            <th className="pb-2 text-right font-medium">Verdict</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.seller}>
              <td className="py-2">
                <span className="block font-medium">{r.seller}</span>
                <span className="block text-xs text-muted">{r.item}</span>
              </td>
              <td className="py-2 text-right font-mono">{r.price}</td>
              <td className="py-2 text-right font-mono text-muted">{r.ratio}</td>
              <td className="py-2 text-right"><VerdictBadge level={r.level} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
