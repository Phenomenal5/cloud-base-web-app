"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// The initial class is set by the inline script in the root layout, before paint,
// so there's no flash. This just reads it back and flips it on click.
export const ThemeToggle = () => {
  const [isDark, setIsDark] = useState(false);

  // Read after mount, not in render. The server can't see the class the pre-paint
  // script sets, so reading it during render mismatches.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = () => {
    const nextIsDark = !isDark;
    setIsDark(nextIsDark);
    document.documentElement.classList.toggle("dark", nextIsDark);
    try {
      localStorage.setItem("theme", nextIsDark ? "dark" : "light");
    } catch {
      // Private mode and blocked storage: the toggle still works for this page.
    }
  };

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
};
