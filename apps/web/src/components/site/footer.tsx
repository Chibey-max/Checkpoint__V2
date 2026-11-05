import Link from "next/link";
import { LogoMark } from "./logo";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <span className="flex items-center gap-2 font-semibold">
            <LogoMark className="size-6" /> Checkpoint
          </span>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
            A spending firewall for AI agents on NEAR. Built for NEAR Hackathon 2026 by Isaac, David and Patrick.
          </p>
          <p className="mt-4 max-w-sm text-xs leading-relaxed text-faint">
            Testnet only. cpUSD is a test token, vendor accounts are stand-ins for real sellers, and the contracts have not had an external audit.
          </p>
        </div>
        <FooterCol title="Product" links={[["Desk", "/desk"], ["Vault", "/vault"], ["Audit", "/audit"], ["Governance", "/governance"]]} />
        <FooterCol
          title="Source"
          links={[
            ["GitHub", "https://github.com/Phantomcall/Checkpoint__V2"],
            ["PRD v2", "https://github.com/Phantomcall/Checkpoint__V2/blob/main/docs/planning/Checkpoint-PRD-v2.pdf"],
            ["Offer snapshot", "https://github.com/Phantomcall/Checkpoint__V2/blob/main/data/snapshot/sources.md"],
          ]}
        />
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="eyebrow">{title}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link href={href} className="text-muted transition-colors hover:text-fg">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
