"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// the inline script in the root layout sets the class before anything paints, so
// there's no flash. this just reads it back and flips it when clicked
export const ThemeToggle = () => {
  const [isDark, setIsDark] = useState(false);

  // read it after mount, not during render. the server can't see what that
  // pre-paint script did, so reading it in render is a hydration mismatch
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
      // private mode or blocked storage. the toggle still works for this page
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
