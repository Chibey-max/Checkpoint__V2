import { FlaskConical } from "lucide-react";

/** FR-UI07: visible on every screen, never dismissable. */
export function TestnetBanner() {
  return (
    <div role="status" className="sticky top-0 z-50 border-b border-black/10 bg-testnet text-navy">
      <p className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold tracking-wide uppercase">
        <FlaskConical aria-hidden className="size-3.5" />
        Testnet · test tokens · vendor accounts are stand-ins
      </p>
    </div>
  );
}
