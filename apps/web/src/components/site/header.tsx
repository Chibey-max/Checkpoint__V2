"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "./logo";
import { TestnetStrip } from "./testnet-strip";
import { ThemeToggle } from "./theme-toggle";
import { WalletButton } from "./wallet-button";

const LINKS = [
  { href: "/desk", label: "Desk" },
  { href: "/vault", label: "Vault" },
  { href: "/audit", label: "Audit" },
  { href: "/governance", label: "Governance" },
] as const;

/**
 * The site's nav: a short, thick pill of liquid gold, dark in both themes so it sits right over the vault hero.
 * A glossy lens lies across the top, a glint runs along it now and then, and the current page is a drop of poured gold.
 * The network is on the tag under it, so the pill only carries what you click.
 */
export function Header() {
  const path = usePathname();
  const isOn = (href: string) => path === href || path.startsWith(`${href}/`);
  return (
    <header className="sticky top-3 z-40 mx-auto mt-3 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <nav aria-label="Main" className="nav-rail mx-auto flex h-[60px] w-full items-center gap-2 rounded-full px-2.5 md:w-fit">
        <span aria-hidden className="nav-glint" />
        <Link href="/" aria-label="Checkpoint home" className="mr-1 flex shrink-0 items-center gap-2 rounded-full">
          <span className="nav-socket">
            <span>
              <LogoMark className="size-5" />
            </span>
          </span>
          <span className="nav-word pr-1 max-[380px]:hidden">Checkpoint</span>
        </Link>
        <span aria-hidden className="nav-div mx-1 hidden md:block" />
        <ul className="hidden items-center gap-0.5 md:flex">
          {LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link href={href} aria-current={isOn(href) ? "page" : undefined} className="nav-link">
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <span aria-hidden className="nav-div mx-1 hidden md:block" />
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <ThemeToggle className="nav-knob" />
          <WalletButton />
        </div>
      </nav>
      <ul className="nav-plate mx-auto mt-2 flex w-fit justify-center gap-0.5 rounded-full p-1 md:hidden">
        {LINKS.map(({ href, label }) => (
          <li key={href}>
            <Link href={href} aria-current={isOn(href) ? "page" : undefined} className="nav-link">
              {label}
            </Link>
          </li>
        ))}
      </ul>
      <TestnetStrip />
    </header>
  );
}
