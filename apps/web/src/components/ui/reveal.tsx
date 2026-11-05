"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Fades and lifts content in once it scrolls into view. Reduced motion shows it at once (CSS kills the transition). */
export function Reveal({ children, className = "", delay = 0, as: Tag = "div", spotlight = false }: { children: ReactNode; className?: string; delay?: number; as?: "div" | "li" | "section"; spotlight?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    // @ts-expect-error: ref type differs per tag, all are HTMLElement
    <Tag ref={ref} data-shown={shown} data-spotlight={spotlight || undefined} style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }} className={`reveal ${className}`}>
      {children}
    </Tag>
  );
}
