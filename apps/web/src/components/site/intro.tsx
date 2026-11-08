"use client";

import { useEffect, useRef, useState } from "react";
import { Tumbler } from "@/components/landing/tumbler";
import { RingLock } from "./ring-lock";

const LOCKS = [
  { n: "I", label: "Guard", code: "07" },
  { n: "II", label: "You", code: "42" },
  { n: "III", label: "Vault", code: "19" },
] as const;

/**
 * ms: when each ring is told to lock (from start); after the last ring seats, when the core lights and when the
 * vault irises open; how long the opening takes; and the latest it may open, whatever the rings are doing.
 */
const AT = { locks: [400, 950, 1500], settle: 300, open: 750, opening: 850, latest: 4600 } as const;

/**
 * The first thing someone sees when they open the site: the ring lock from the first hero, dialling its
 * combination. Each ring turns home in lock order (Guard, You, Vault) while its number stops rolling; then the core
 * lights and the lock irises open onto the page underneath. The labels follow the rings as they actually seat.
 *
 * It plays once per browser session. The head script in layout.tsx decides before first paint (data-intro on
 * <html>): "skip" with reduced motion, after it has played, or with ?intro=0; ?intro=1 forces it. It's in the
 * server HTML so it covers the page from the first frame, and CSS hides it after a few seconds even if this
 * script never runs. Esc, Enter, a click or the Skip key jump straight to the opening.
 */
export function Intro() {
  const [gone, setGone] = useState(false);
  const [locked, setLocked] = useState(0);
  const [seated, setSeated] = useState(0);
  const [settled, setSettled] = useState(false);
  const [opening, setOpening] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const codes = useRef<(HTMLSpanElement | null)[]>([]);
  const seatedRef = useRef(0);
  const openRef = useRef<() => void>(() => {});

  useEffect(() => {
    const html = document.documentElement;
    if (html.dataset.intro !== "play") return void setGone(true);
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    window.scrollTo(0, 0);

    const timers: number[] = [];
    let opened = false;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      html.style.overflow = overflow;
      html.dataset.intro = "done";
      try {
        sessionStorage.setItem("cp-intro", "1");
      } catch {}
      setGone(true);
      window.dispatchEvent(new Event("cp-intro-done"));
    };
    const open = () => {
      if (opened) return;
      opened = true;
      setSettled(true);
      setOpening(true);
      timers.push(window.setTimeout(finish, AT.opening));
    };
    openRef.current = open;
    AT.locks.forEach((t, i) => timers.push(window.setTimeout(() => setLocked(i + 1), t)));
    timers.push(window.setTimeout(open, AT.latest));

    // the combination: each number rolls until its ring locks
    let raf = 0;
    let lastRoll = 0;
    const roll = (now: number) => {
      if (now - lastRoll > 70) {
        lastRoll = now;
        codes.current.forEach((el, i) => {
          if (!el) return;
          const code = i < seatedRef.current ? LOCKS[i]!.code : String(Math.floor(Math.random() * 100)).padStart(2, "0");
          if (el.textContent !== code) el.textContent = code;
        });
      }
      raf = requestAnimationFrame(roll);
    };
    raf = requestAnimationFrame(roll);

    const skip = () => {
      timers.forEach(clearTimeout);
      timers.length = 0;
      seatedRef.current = 3;
      setLocked(3);
      setSeated(3);
      open();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") skip();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("cp-intro-skip", skip);

    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cp-intro-skip", skip);
      html.style.overflow = overflow;
    };
  }, []);

  // once the last ring is home: light the core, then open
  useEffect(() => {
    if (seated < 3) return;
    const a = window.setTimeout(() => setSettled(true), AT.settle);
    const b = window.setTimeout(() => openRef.current(), AT.open);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [seated]);
  // without WebGL the tumbler stands in, and a ring is home as soon as it's told to lock
  useEffect(() => {
    if (!webgl) {
      seatedRef.current = locked;
      setSeated(locked);
    }
  }, [webgl, locked]);
  const onSeat = (i: number) => {
    seatedRef.current = Math.max(seatedRef.current, i + 1);
    setSeated(seatedRef.current);
  };

  if (gone) return null;

  return (
    <div
      className="cp-intro"
      data-open={opening}
      role="status"
      aria-label="Opening Checkpoint"
      onClick={() => window.dispatchEvent(new Event("cp-intro-skip"))}
    >
      <div className="cp-intro-rim" aria-hidden />
      <div className="cp-intro-stage">
        <p className="cp-intro-word" aria-hidden>
          Checkpoint
        </p>
        <div className="cp-intro-dial" aria-hidden>
          {webgl ? (
            <RingLock state={{ locked: [locked >= 1, locked >= 2, locked >= 3], settled }} onSeat={onSeat} onUnsupported={() => setWebgl(false)} />
          ) : (
            <Tumbler
              style={
                {
                  "--ts": "min(62vmin, 440px)",
                  opacity: 1,
                  visibility: "visible",
                  "--l1": seated >= 1 ? 1 : 0,
                  "--l2": seated >= 2 ? 1 : 0,
                  "--l3": seated >= 3 ? 1 : 0,
                  "--num": Math.max(0, seated - 1),
                } as React.CSSProperties
              }
            />
          )}
        </div>
        <ol className="cp-intro-locks" aria-hidden>
          {LOCKS.map((l, i) => (
            <li key={l.n} data-on={seated > i}>
              <span className="cp-intro-n">{l.n}</span>
              <span>{l.label}</span>
              <span
                className="cp-intro-code"
                ref={(el) => {
                  codes.current[i] = el;
                }}
              >
                {l.code}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <button
        type="button"
        className="cp-intro-skip"
        onClick={(e) => {
          e.stopPropagation();
          window.dispatchEvent(new Event("cp-intro-skip"));
        }}
      >
        Skip <kbd>Esc</kbd>
      </button>
    </div>
  );
}
