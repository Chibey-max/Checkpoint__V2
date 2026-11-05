const ITEMS = [
  "Settled on NEAR",
  "Rust Vault · near-sdk 5",
  "Rules hash on-chain",
  "ed25519 Guard signatures",
  "Sputnik DAO policy",
  "NEP-141 cpUSD",
  "Claude parses lists · advisory only",
  "NEAR Connect wallets",
];

export function StackBar() {
  return (
    <div className="relative -mx-4 overflow-hidden border-y border-line py-4 sm:-mx-6 lg:-mx-8 [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
      <div className="flex w-max animate-marquee gap-10 pr-10">
        {[...ITEMS, ...ITEMS].map((t, i) => (
          <span key={i} className="flex items-center gap-10 font-mono text-[11.5px] tracking-[0.16em] whitespace-nowrap text-muted uppercase">
            {t}
            <span aria-hidden className="size-1 rounded-full bg-faint" />
          </span>
        ))}
      </div>
    </div>
  );
}
