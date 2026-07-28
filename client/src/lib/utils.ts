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

// ─── formatTimeUntil: "in about 4 hours" / "in 25 minutes" ──
// The forward-looking counterpart to formatRelativeTime, used to tell someone
// who has hit their daily quota when they get access back. Deliberately vague at
// the hour scale — "in about 4 hours" is friendlier than "in 3h 47m".
// NOTE: same SSR caveat as formatRelativeTime — client-side render only.
export function formatTimeUntil(isoTimestamp: string) {
  const remainingSeconds = Math.round((new Date(isoTimestamp).getTime() - Date.now()) / 1000);

  if (remainingSeconds <= 0) return "any moment now";
  if (remainingSeconds < 60) return "in less than a minute";

  const remainingMinutes = Math.round(remainingSeconds / 60);
  if (remainingMinutes < 60) {
    return `in ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"}`;
  }

  const remainingHours = Math.round(remainingMinutes / 60);
  return `in about ${remainingHours} hour${remainingHours === 1 ? "" : "s"}`;
}

// The reset instant as a local wall-clock time ("1:00 AM"). The server works in
// UTC, but telling someone "midnight UTC" is useless if they're in Lagos or
// Chicago — show it in their own timezone.
export function formatLocalTime(isoTimestamp: string) {
  return new Date(isoTimestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
