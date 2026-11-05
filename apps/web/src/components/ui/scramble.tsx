"use client";

import { useEffect, useState } from "react";

const HEX = "0123456789abcdef";

/**
 * Hex text that resolves left to right out of noise when `play` turns true, like bytes being decoded.
 * Width never changes (same length, monospace), so nothing around it reflows.
 */
export function Scramble({ text, play, duration = 1100 }: { text: string; play: boolean; duration?: number }) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (!play) {
      setOut(text);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const fixed = Math.floor(k * text.length);
      let s = text.slice(0, fixed);
      for (let i = fixed; i < text.length; i++) s += HEX[(Math.random() * 16) | 0];
      setOut(s);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, text, duration]);
  return <span className="tabular">{out}</span>;
}
