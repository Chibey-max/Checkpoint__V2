"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

type ViewTransitionDoc = Document & { startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> } };

/**
 * Flips the theme. Where the browser has view transitions, the new theme opens out of the button in a growing circle
 * over the old one, so the whole page (the vault included, which relights itself) changes in one smooth sweep.
 * Without them, or with reduced motion, it switches at once.
 */
export function ThemeToggle({ className = "key key-ghost size-9" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);
  useEffect(() => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark"), []);

  function flip(e: React.MouseEvent<HTMLButtonElement>) {
    const html = document.documentElement;
    const next = theme === "light" ? "dark" : "light";
    const apply = () => {
      html.dataset.theme = next;
      try {
        localStorage.setItem("cp-theme", next);
      } catch {}
      flushSync(() => setTheme(next));
    };

    const doc = document as ViewTransitionDoc;
    if (!doc.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();

    // the circle grows from the middle of the button until it covers the farthest corner
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    // no CSS transitions while the page swaps, so the new theme is captured finished, not mid-fade
    html.setAttribute("data-theme-switching", "");
    const vt = doc.startViewTransition(apply);
    vt.ready
      .then(() =>
        html.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
          { duration: 1100, easing: "cubic-bezier(0.5, 0, 0.15, 1)", pseudoElement: "::view-transition-new(root)" },
        ),
      )
      .catch(() => {});
    vt.finished.finally(() => html.removeAttribute("data-theme-switching"));
  }

  return (
    <button onClick={flip} aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"} className={className}>
      {theme === "light" ? <Moon aria-hidden className="size-4" /> : <Sun aria-hidden className="size-4" />}
    </button>
  );
}
