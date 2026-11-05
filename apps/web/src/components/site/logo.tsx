/** Mark: three concentric arcs (Guard, You, Vault) with one notch aligned, the "locked" position. */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="cp-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-accent)" />
          <stop offset="1" stopColor="var(--color-accent-strong)" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeOpacity=".28" strokeWidth="2" strokeDasharray="70 18" transform="rotate(-62 16 16)" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="currentColor" strokeOpacity=".55" strokeWidth="2" strokeDasharray="46 14" transform="rotate(-70 16 16)" />
      <circle cx="16" cy="16" r="5" fill="none" stroke="url(#cp-mark)" strokeWidth="2.2" strokeDasharray="25 6.5" transform="rotate(-80 16 16)" />
      <rect x="15" y="0.8" width="2" height="16" rx="1" fill="url(#cp-mark)" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2 text-fg">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">Checkpoint</span>
    </span>
  );
}
