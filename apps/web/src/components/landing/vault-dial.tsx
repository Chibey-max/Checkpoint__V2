/** SVG stand-in for the WebGL vault, used when WebGL2 isn't available. Same rings, same lock order. */
const RINGS = [
  { key: "guard", r: 108, spin: "animate-[spin_38s_linear_infinite]" },
  { key: "you", r: 156, spin: "animate-[spin-rev_52s_linear_infinite]" },
  { key: "vault", r: 204, spin: "animate-[spin_70s_linear_infinite]" },
] as const;

export function VaultDialFallback({ phase }: { phase: number }) {
  return (
    <div className="relative size-full">
      <div className="dial-bezel absolute inset-[4%] rounded-full" />
      <div className="dial-face absolute inset-[7.5%] rounded-full" />
      <svg viewBox="-250 -250 500 500" className="absolute inset-0 size-full" aria-hidden>
        {RINGS.map((ring, i) => {
          const locked = phase > i;
          const c = 2 * Math.PI * ring.r;
          return (
            <g key={ring.key} className={locked ? "dial-locked" : ""}>
              <g className={`dial-ring ${ring.spin}`}>
                <circle r={ring.r} fill="none" strokeWidth="20" style={{ stroke: "var(--color-line)" }} />
                <circle r={ring.r} fill="none" strokeWidth="9" style={{ stroke: "var(--color-faint)", strokeOpacity: 0.55, strokeDasharray: `1.2 ${c / 90 - 1.2}` }} />
                <circle
                  r={ring.r}
                  fill="none"
                  strokeWidth="3"
                  strokeLinecap="round"
                  transform="rotate(-90)"
                  className="dial-arc"
                  style={{
                    stroke: locked ? "var(--color-accent)" : "var(--color-steel)",
                    strokeOpacity: locked ? 1 : 0.5,
                    strokeDasharray: locked ? `${c} 0` : `${c * 0.14} ${c}`,
                  }}
                />
                <rect x="-3.5" y={-ring.r - 15} width="7" height="30" rx="3.5" style={{ fill: locked ? "var(--color-accent)" : "var(--color-steel)" }} />
              </g>
            </g>
          );
        })}
        <path d="M -7 -246 L 7 -246 L 0 -234 Z" style={{ fill: "var(--color-accent)" }} />
      </svg>
    </div>
  );
}
