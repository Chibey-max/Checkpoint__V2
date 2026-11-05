"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./wallet-button";

const LINKS = [
  { href: "/vault", label: "Vault" },
  { href: "/desk", label: "Desk" },
  { href: "/audit", label: "Audit" },
  { href: "/governance", label: "Governance" },
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <header className="bg-navy text-white">
      <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="grid size-6 place-items-center rounded bg-blue text-xs font-bold">C</span>
          Checkpoint
        </Link>
        <ul className="flex gap-1 text-sm">
          {LINKS.map(({ href, label }) => {
            const active = path === href || path.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded px-3 py-1.5 transition-colors ${active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="ml-auto">
          <WalletButton />
        </div>
      </nav>
    </header>
  );
}
