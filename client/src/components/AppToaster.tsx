"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";

// keeps sonner's theme matching our class-based dark mode. the observer is what
// makes it follow along live when someone toggles, instead of only on load
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
