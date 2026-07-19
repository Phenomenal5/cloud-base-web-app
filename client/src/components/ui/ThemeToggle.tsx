"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// Toggles the `.dark` class on <html> and persists the choice. The initial class
// is set by an inline script in the root layout (before paint) so there's no
// flash; here we just read it back on mount and flip it on click.
export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Deferred to mount on purpose: reading the theme during render would cause an
    // SSR/hydration mismatch (server can't see the class the pre-paint script sets).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const nextIsDark = !isDark;
    setIsDark(nextIsDark);
    document.documentElement.classList.toggle("dark", nextIsDark);
    try {
      localStorage.setItem("theme", nextIsDark ? "dark" : "light");
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="rounded-lg border border-border p-2 text-muted transition hover:bg-surface-2 hover:text-foreground"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
