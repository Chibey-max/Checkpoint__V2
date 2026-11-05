/** FR-UI07: on every screen, never dismissable. */
export function TestnetStrip() {
  return (
    <div role="status" className="relative z-50 border-b border-line bg-[color-mix(in_srgb,var(--color-testnet)_10%,var(--color-bg))]">
      <p className="mx-auto flex max-w-7xl items-center justify-center gap-2.5 px-4 py-1.5 font-mono text-[10.5px] tracking-[0.2em] text-testnet uppercase">
        <span className="size-1.5 rounded-full bg-testnet animate-pulse-dot" />
        Testnet · test tokens · vendor accounts are stand-ins
      </p>
    </div>
  );
}
