import { forwardRef } from "react";

/**
 * A combination tumbler in CSS: a knurled bezel, three machined rings (Guard inside, You, Vault outside) and a
 * brass core showing the lock's numeral. The intro shows it in place of the WebGL ring lock when WebGL2 isn't
 * there. It has no state of its own; the caller sets CSS variables:
 *   --ts size · --a1..--a3 ring angles (deg) · --l1..--l3 seam light per ring (0..1)
 *   --num numeral roll (0 = I, 1 = II, 2 = III) · --rings ring opacity · --flash a gold flare
 */
const RINGS = [
  // inset (% of the tumbler), band (% of the ring's own size, for the notch), mask stop where the band starts (% of radius)
  { k: 3, inset: 7, band: 9.3, hole: 81.4 },
  { k: 2, inset: 17.5, band: 12.3, hole: 75.4 },
  { k: 1, inset: 28, band: 17, hole: 65.9 },
] as const;
/** each ring's seam sits in the groove just inside it */
const SEAMS = [
  { k: 3, inset: 16.25 },
  { k: 2, inset: 26.75 },
  { k: 1, inset: 36.5 },
] as const;

export const Tumbler = forwardRef<HTMLDivElement, { style?: React.CSSProperties }>(function Tumbler({ style }, ref) {
  return (
    <div ref={ref} aria-hidden className="tumbler" style={{ opacity: 0, visibility: "hidden", ...style }}>
      <div className="tb-halo" />
      <div className="tb-bezel" />
      <div className="tb-well" />
      <div className="tb-rings">
        {SEAMS.map((s) => (
          <div key={s.k} className="tb-seam" style={{ inset: `${s.inset}%`, opacity: `var(--l${s.k}, 0)` }} />
        ))}
        {RINGS.map((r) => (
          <div
            key={r.k}
            className="tb-ring"
            style={
              {
                inset: `${r.inset}%`,
                transform: `rotate(var(--a${r.k}, 0deg))`,
                "--hole": `${r.hole}%`,
              } as React.CSSProperties
            }
          >
            <i className="tb-notch" style={{ height: `${r.band}%` }} />
          </div>
        ))}
        <div className="tb-sheen" />
      </div>
      <div className="tb-core">
        <span>
          <span className="tb-num">
            <b>I</b>
            <b>II</b>
            <b>III</b>
          </span>
        </span>
      </div>
      <i className="tb-index" />
    </div>
  );
});
