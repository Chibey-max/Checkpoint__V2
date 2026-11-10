"use client";

import { House, Landmark, LockKeyhole, ScrollText, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "./logo";
import { TestnetNote, TestnetStrip } from "./testnet-strip";
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
 *
 * It gets out of the way: scrolling down slides it up out of view, scrolling up (or reaching the top) brings it back.
 * The testnet tag under it stays, pinned to the top edge (FR-UI07). Keyboard focus inside it always shows it.
 *
 * Phones: the page links move to a dock at the bottom, in thumb reach, and the testnet notice rides in that dock.
 * The top bar keeps only the mark, the theme and the wallet, and slides fully away on scroll.
 */
export function Header() {
  const path = usePathname();
  const isOn = (href: string) => path === href || path.startsWith(`${href}/`);
  const ref = useRef<HTMLElement>(null);
  const tag = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let raf = 0;
    const read = () => {
      raf = 0;
      const y = window.scrollY;
      const dy = y - lastY;
      if (y < 60) setHidden(false);
      else if (dy > 6) setHidden(true);
      else if (dy < -6) setHidden(false);
      if (Math.abs(dy) > 6 || y < 60) lastY = y;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    // how far up the header goes: everything above the tag, leaving the tag 8px below the top edge.
    // On phones the tag lives in the bottom dock, so the whole bar goes.
    const measure = () => {
      const h = ref.current;
      const t = tag.current;
      if (!h || !t) return;
      const shown = t.offsetHeight > 0;
      h.style.setProperty("--hide-by", `${shown ? t.offsetTop + 12 - 8 : h.offsetHeight + 24}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);
  // a new page starts with the nav showing
  useEffect(() => setHidden(false), [path]);

  return (
    <>
    <header ref={ref} data-hidden={hidden} className="site-header sticky top-3 z-40 mx-auto mt-3 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
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
      <div ref={tag} className="max-md:hidden">
        <TestnetStrip />
      </div>
    </header>
    <MobileDock isOn={isOn} />
    </>
  );
}

const DOCK = [
  { href: "/", label: "Home", Icon: House },
  { href: "/desk", label: "Desk", Icon: ShoppingBasket },
  { href: "/vault", label: "Vault", Icon: LockKeyhole },
  { href: "/audit", label: "Audit", Icon: ScrollText },
  { href: "/governance", label: "Council", Icon: Landmark },
] as const;

/** Phones only: the page links in a glass dock at the bottom of the screen, with the testnet notice along its top edge. */
function MobileDock({ isOn }: { isOn: (href: string) => boolean }) {
  const path = usePathname();
  return (
    <nav aria-label="Pages" className="dock fixed inset-x-3 z-40 md:hidden">
      <TestnetNote />
      <ul className="grid grid-cols-5">
        {DOCK.map(({ href, label, Icon }) => {
          const on = href === "/" ? path === "/" : isOn(href);
          return (
            <li key={href}>
              <Link href={href} aria-current={on ? "page" : undefined} className="dock-tab">
                <span className="dock-icon">
                  <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
