/**
 * Which rendering tier this device gets. Phones and tablets (a coarse pointer) and low-memory devices take the lite tier:
 * the WebGL scenes march fewer steps, cast shorter shadows and render fewer pixels, so they hold their frame rate.
 * `?quality=lite` or `?quality=full` forces a tier, for testing.
 */
export function isLiteDevice(): boolean {
  if (typeof window === "undefined") return false;
  const forced = new URLSearchParams(window.location.search).get("quality");
  if (forced === "lite") return true;
  if (forced === "full") return false;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return coarse || memory <= 4;
}

/** True when the main input is a finger rather than a mouse or trackpad. */
export function isTouch(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}
