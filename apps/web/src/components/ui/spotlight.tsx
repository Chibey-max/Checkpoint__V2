"use client";

import { useEffect } from "react";

/**
 * One document-level listener drives the pointer spotlight on every [data-spotlight] element:
 * it writes the pointer position into --mx/--my on the card under the cursor. CSS does the rest.
 */
export function Spotlight() {
  useEffect(() => {
    if (window.matchMedia("(hover: none)").matches) return;
    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-spotlight]") as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);
  return null;
}
