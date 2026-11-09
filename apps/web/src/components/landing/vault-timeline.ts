/**
 * The landing hero's scroll timeline, in one place. `p` runs 0..1 over the pinned hero. The door (vault-door.tsx)
 * and the lock cards (hero.tsx) both read from here, so the story stays in step:
 *   Guard's card plays while the wheel turns, your approval releases the bolts and swings the door,
 *   and the Vault's card arrives as you walk up to the gold.
 * Between locks there's a handoff: the finished card swings open on its hinge like the vault door, and the next
 * comes forward from behind it or swings shut into place. The second handoff also switches the vault's lamps on,
 * front to back.
 */
export const T = {
  copyOut: [0.02, 0.065],
  guard: [0.075, 0.375],
  wheel: [0.09, 0.33],
  guardSteps: [0.12, 0.165, 0.21, 0.255, 0.3],
  /** Guard → You, and You → Vault */
  hand: [
    [0.315, 0.415],
    [0.685, 0.785],
  ],
  youSteps: [0.415, 0.48, 0.535],
  press: [0.43, 0.48],
  bolt: [0.48, 0.54],
  open: [0.53, 0.73],
  recentre: [0.52, 0.66],
  enter: [0.6, 0.94],
  vaultSteps: [0.79, 0.81, 0.83, 0.85, 0.87, 0.89, 0.915],
  shift: [0.72, 0.92],
  fade: [0.94, 1],
  rail: [0.2, 0.375, 0.56, 0.745],
  /** each ceiling lamp switches on here (front to back), out of a dim standby */
  lamps: [0.7, 0.72, 0.74],
} as const;

/** Standby level of the vault's lamps before the Vault's lock engages. */
const STANDBY = 0.12;
/** A lamp coming on: a couple of stutters, then full. Scroll-scrubbed, so it's a function of progress, not time. */
function lampLevel(p: number, at: number) {
  const t = seg(p, at, at + 0.018);
  if (t <= 0) return STANDBY;
  if (t >= 1) return 1;
  const stutter = t < 0.35 ? (Math.sin(t * 60) > 0 ? 0.9 : 0.35) : t < 0.55 ? 0.45 : 0.8 + 0.2 * t;
  return STANDBY + (1 - STANDBY) * stutter;
}

export const seg = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** How many of the thresholds `p` has passed. */
export const passed = (p: number, at: readonly number[]) => at.reduce((n, a) => n + (p >= a ? 1 : 0), 0);

/** What the mechanism is doing at `p`. */
export function vaultPose(p: number) {
  return {
    wheel: easeInOut(seg(p, ...T.wheel)) * Math.PI * 2.4,
    bolt: easeInOut(seg(p, ...T.bolt)),
    open: easeInOut(seg(p, ...T.open)) * 1.85,
    cam: 0.35 * easeInOut(seg(p, ...T.recentre)) + 0.65 * easeInOut(seg(p, ...T.enter)),
    /** 0 while the door sits beside the copy, 1 once the camera has squared up to it */
    centre: easeInOut(seg(p, ...T.recentre)),
    /** 0 → 1 as the inside shot slides over to leave room for the Vault's card */
    shift: easeInOut(seg(p, ...T.shift)),
    lamps: T.lamps.map((at) => lampLevel(p, at)) as [number, number, number],
  };
}
