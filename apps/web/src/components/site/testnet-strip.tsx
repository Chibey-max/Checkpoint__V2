import { config } from "@/lib/config";

/**
 * FR-UI07: on every screen, never dismissable. A small gold-rimmed tag hanging under the nav, naming the network, inside the sticky header,
 * so it stays in view as the page scrolls.
 */
export function TestnetStrip() {
  return (
    <p role="status" className="nav-tag mx-auto mt-1.5 flex w-fit items-center gap-2 rounded-full px-3 py-1 font-mono text-[9.5px] tracking-[0.18em] uppercase max-sm:gap-1.5 max-sm:px-2.5 max-sm:text-[8.5px] max-sm:tracking-[0.03em]">
      <span className="size-1.5 shrink-0 rounded-full bg-[#ff9a5c] animate-pulse-dot" />
      NEAR {config.network} · test tokens · vendor accounts are stand-ins
    </p>
  );
}

/** The same notice, as one line along the top of the phone dock (FR-UI07: on every screen). */
export function TestnetNote() {
  return (
    <p role="status" className="dock-note flex items-center justify-center gap-1.5 font-mono text-[8.5px] tracking-[0.06em] uppercase">
      <span className="size-1 shrink-0 rounded-full bg-[#ff9a5c] animate-pulse-dot" />
      NEAR {config.network} · test tokens · vendor accounts are stand-ins
    </p>
  );
}
