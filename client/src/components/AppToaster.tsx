"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";

// Wraps sonner's Toaster and keeps its theme in sync with our class-based dark
// mode (updates live when the theme is toggled).
export function AppToaster() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setTheme(root.classList.contains("dark") ? "dark" : "light");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return <Toaster theme={theme} position="top-center" richColors closeButton />;
}
