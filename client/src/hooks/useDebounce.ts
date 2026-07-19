"use client";

import { useEffect, useState } from "react";

// Returns a debounced copy of a value — updates only after `delay` ms of no
// changes. Used to avoid firing a search request on every keystroke.
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
