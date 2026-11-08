"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle({ className = "key key-ghost size-9" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);
  useEffect(() => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark"), []);

  function flip() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("cp-theme", next);
    } catch {}
    setTheme(next);
  }

  return (
    <button
      onClick={flip}
      aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
      className={className}
    >
      {theme === "light" ? <Moon aria-hidden className="size-4" /> : <Sun aria-hidden className="size-4" />}
    </button>
  );
}
