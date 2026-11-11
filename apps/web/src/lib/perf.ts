/**
 * Rendering tiers for the WebGL scenes, set separately for desktops and phones.
 *
 * A device is a phone or tablet when touch is its only way to point (no hover). A touchscreen laptop with a trackpad
 * or mouse is a desktop. Very low-memory devices count as mobile too.
 *
 * Overrides for testing: `?quality=lite` (mobile tier) or `?quality=full` (desktop tier); `?res=0.8` pins the render
 * scale (0.3 to 1) and turns off auto-adjusting; `?debug=render` shows the tier, resolution and GPU time on screen.
 */
export type RenderTier = "desktop" | "mobile";

export interface RenderSettings {
  /** the cheaper shader variant (fewer march steps, shorter shadows) */
  lite: boolean;
  /** most pixels the canvas may have at full scale */
  maxPixels: number;
  /** cap on the screen's device-pixel ratio */
  maxDpr: number;
  /** the auto-adjuster never renders below this share of full resolution (linear) */
  minScale: number;
  /** GPU milliseconds per frame the auto-adjuster aims to stay under */
  targetMs: number;
}

export const RENDER: Record<RenderTier, RenderSettings> = {
  desktop: { lite: false, maxPixels: 1_600_000, maxDpr: 1.5, minScale: 0.6, targetMs: 12 },
  mobile: { lite: true, maxPixels: 330_000, maxDpr: 2, minScale: 0.55, targetMs: 14 },
};

const param = (k: string) => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(k));

export function renderTier(): RenderTier {
  if (typeof window === "undefined") return "desktop";
  const forced = param("quality");
  if (forced === "lite") return "mobile";
  if (forced === "full") return "desktop";
  const touchOnly = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return touchOnly || memory <= 2 ? "mobile" : "desktop";
}

/** A pinned render scale from `?res=`, or null to let the auto-adjuster decide. */
export function pinnedScale(): number | null {
  const v = Number(param("res"));
  return v > 0 ? Math.min(1, Math.max(0.3, v)) : null;
}

export const debugRender = () => param("debug") === "render";

/** True when the main input is a finger rather than a mouse or trackpad. */
export function isTouch(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}
