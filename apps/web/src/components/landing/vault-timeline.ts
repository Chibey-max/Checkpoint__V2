/**
 * The landing hero's scroll timeline, in one place. `p` runs 0..1 over the pinned hero. The door (vault-door.tsx)
 * and the lock cards (hero.tsx) both read from here, so the story stays in step:
 *   Guard's card plays while the wheel turns, your approval releases the bolts and swings the door,
 *   and the Vault's card arrives as you walk up to the gold.
 */
export const T = {
  copyOut: [0.02, 0.065],
  guard: [0.075, 0.375],
  wheel: [0.09, 0.33],
  guardSteps: [0.12, 0.165, 0.21, 0.255, 0.3],
  you: [0.385, 0.72],
  youSteps: [0.4, 0.48, 0.535],
  press: [0.43, 0.48],
  bolt: [0.48, 0.54],
  open: [0.53, 0.73],
  recentre: [0.52, 0.66],
  enter: [0.6, 0.94],
  vault: [0.745, 1.2],
  vaultSteps: [0.79, 0.81, 0.83, 0.85, 0.87, 0.89, 0.915],
  shift: [0.72, 0.92],
  fade: [0.94, 1],
  rail: [0.2, 0.385, 0.56, 0.745],
} as const;

export const seg = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** How many of the thresholds `p` has passed. */
export const passed = (p: number, at: readonly number[]) => at.reduce((n, a) => n + (p >= a ? 1 : 0), 0);
/** 0 → 1 → 0 over a window, with short fades at each end. */
export const windowed = (p: number, [a, b]: readonly [number, number], f = 0.03) => seg(p, a, a + f) * (1 - seg(p, b - f, b));

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
  };
}
