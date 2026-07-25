import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// ─── cn: merge Tailwind classes with conditional logic ──
// House helper — dedupes/merges conflicting Tailwind utilities.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── formatRelativeTime: "just now" / "5m ago" / "3d ago" ──
// Falls back to a short date past a week, where "8d ago" stops being useful.
// NOTE: reads Date.now() at render time, so only call it from a client component
// AFTER its data has loaded. Rendering it during SSR would bake the server's
// clock into the HTML and mismatch on hydration.
export function formatRelativeTime(isoTimestamp: string) {
  const timestamp = new Date(isoTimestamp);
  // Clamp at 0: a row created moments ago can read as the future if the server
  // clock is slightly ahead of the browser's.
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - timestamp.getTime()) / 1000));

  if (elapsedSeconds < 60) return "just now";

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays}d ago`;

  return timestamp.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
