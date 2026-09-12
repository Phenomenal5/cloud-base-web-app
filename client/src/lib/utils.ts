import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Merges Tailwind classes and resolves conflicting utilities.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// The three formatters below read the clock at render time, so they're client
// only. Running one in SSR bakes the server's clock into the HTML.

// "just now" / "5m ago" / "3d ago", falling back to a short date past a week
// where "8d ago" stops being useful.
export function formatRelativeTime(isoTimestamp: string) {
  const timestamp = new Date(isoTimestamp);
  // Clamped at 0, because a row created moments ago reads as the future if the
  // server clock is slightly ahead of the browser's.
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

// The forward-looking counterpart, for telling someone who has hit their quota
// when they get access back. Vague on purpose at the hour scale: "in about 4
// hours" reads better than "in 3h 47m".
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

// The server works in UTC, but "midnight UTC" is useless to someone in Lagos or
// Chicago, so show the reset in their own timezone.
export function formatLocalTime(isoTimestamp: string) {
  return new Date(isoTimestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
