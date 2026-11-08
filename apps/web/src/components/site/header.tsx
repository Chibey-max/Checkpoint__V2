"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { config } from "@/lib/config";
import { LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { WalletButton } from "./wallet-button";

const LINKS = [
  { href: "/desk", label: "Desk" },
  { href: "/vault", label: "Vault" },
  { href: "/audit", label: "Audit" },
  { href: "/governance", label: "Governance" },
] as const;

/**
 * The site's nav: a machined gunmetal rail, dark in both themes so it sits right over the vault hero.
 * The mark sits in a brass socket; the current page is a recessed plate with a brass index notch, like a dial.
 */
export function Header() {
  const path = usePathname();
  const isOn = (href: string) => path === href || path.startsWith(`${href}/`);
  return (
    <header className="sticky top-3 z-40 mx-auto mt-3 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <nav aria-label="Main" className="nav-rail flex h-[60px] items-center gap-2 rounded-full pr-2.5 pl-2.5">
        <Link href="/" aria-label="Checkpoint home" className="mr-1 flex shrink-0 items-center gap-2.5 rounded-full">
          <span className="nav-socket">
            <span>
              <LogoMark className="size-[22px]" />
            </span>
          </span>
          <span className="nav-word max-[380px]:hidden">Checkpoint</span>
        </Link>
        <span aria-hidden className="nav-div mx-2 hidden md:block" />
        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link href={href} aria-current={isOn(href) ? "page" : undefined} className="nav-link">
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-2">
          <span className="nav-led mr-1 hidden lg:inline-flex">
            <i aria-hidden />
            NEAR {config.network}
          </span>
          <ThemeToggle className="nav-knob" />
          <span aria-hidden className="nav-div mx-0.5 hidden sm:block" />
          <WalletButton />
        </div>
      </nav>
      <ul className="nav-plate mx-auto mt-2 flex w-fit justify-center gap-0.5 rounded-full p-1 md:hidden">
        {LINKS.map(({ href, label }) => (
          <li key={href}>
            <Link href={href} aria-current={isOn(href) ? "page" : undefined} className="nav-link !px-3 !py-1 !text-[10.5px]">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </header>
  );
}
