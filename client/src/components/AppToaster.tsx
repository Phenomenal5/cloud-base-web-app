"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";

// Keeps sonner's theme in sync with our class-based dark mode. The observer is
// what makes it update live when the theme is toggled, rather than only on load.
export const AppToaster = () => {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setTheme(root.classList.contains("dark") ? "dark" : "light");

    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return <Toaster theme={theme} position="top-center" richColors closeButton />;
};
