import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// merge tailwind classes, last conflicting utility wins
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// the three formatters below read the clock when they run, so they're client
// only. call one during SSR and the server's clock gets baked into the HTML

// "just now", "5m ago", "3d ago". past a week it switches to a short date,
// "8d ago" stops meaning anything to people
export function formatRelativeTime(isoTimestamp: string) {
  const timestamp = new Date(isoTimestamp);
  // clamp at 0. if the server clock runs slightly ahead, something created a
  // second ago comes out as being in the future
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

// the same thing pointing forwards, for telling someone out of questions when
// they get more. deliberately vague once it's hours, "in about 4 hours" reads
// better than "in 3h 47m"
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

// the server thinks in UTC, but "midnight UTC" means nothing to someone sitting
// in Lagos, so show them the reset in their own timezone
export function formatLocalTime(isoTimestamp: string) {
  return new Date(isoTimestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
