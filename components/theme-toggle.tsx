"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Mirrors the inline script in app/layout.tsx - same storage key, same precedence. */
function isDarkNow(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(isDarkNow());
  }, []);

  function toggle() {
    const next = !isDarkNow();
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("vantage-theme", next ? "dark" : "light");
    setDark(next);
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="size-9"
    >
      {/* Render nothing decisive until mounted, so SSR never guesses the wrong icon. */}
      {dark == null ? null : dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
