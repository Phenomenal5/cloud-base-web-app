"use client";

import { useEffect, useState } from "react";
import { Gauge, Infinity as InfinityIcon } from "lucide-react";
import { useGetUsageQuery } from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { cn, formatLocalTime, formatTimeUntil } from "@/lib/utils";

// A quiet dial by the send button, not a footer count. The count sat there on
// every keystroke and read as a countdown.
//
// Signed-in only. Guest allowance is per IP, and "you're at 50%" means nothing
// to someone with two questions. GuestBanner covers that case.

// Amber past two thirds, red when nearly gone, muted below that, so the icon
// only draws the eye when it matters.
function toneFor(percentUsed: number) {
  if (percentUsed >= 90) return "text-red-600 dark:text-red-400";
  if (percentUsed >= 67) return "text-amber-600 dark:text-amber-400";
  return "text-muted";
}

function barToneFor(percentUsed: number) {
  if (percentUsed >= 90) return "bg-red-500";
  if (percentUsed >= 67) return "bg-amber-500";
  return "bg-brand";
}

export const UsageIndicator = () => {
  const [isOpen, setIsOpen] = useState(false);
  const isAuthenticated = useAppSelector((state) => state.auth.status) === "authenticated";
  const { data: usage } = useGetUsageQuery(undefined, { skip: !isAuthenticated });

  // Escape closes the panel, matching the notification bell and chat drawer.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isAuthenticated || !usage) return null;

  const isUnlimited = usage.percentUsed === null;
  const percentUsed = usage.percentUsed ?? 0;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isUnlimited ? "Daily usage: unlimited" : `Daily usage: ${percentUsed}% used`}
        aria-expanded={isOpen}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-surface-2",
          isUnlimited ? "text-muted" : toneFor(percentUsed),
        )}
      >
        {isUnlimited ? <InfinityIcon className="h-4 w-4" /> : <Gauge className="h-4 w-4" />}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          {/* Opens upward: the composer sits at the bottom of the viewport, so a
 panel hung below it would be off-screen. */}
          <div className="absolute bottom-full right-0 z-20 mb-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface p-3 shadow-lg">
            <p className="text-xs font-medium text-muted">Daily usage</p>

            {isUnlimited ? (
              <p className="mt-1.5 text-sm">
                Unlimited, your account isn&apos;t subject to a daily allowance.
              </p>
            ) : (
              <>
                <p className={cn("mt-1 text-2xl font-semibold", toneFor(percentUsed))}>
                  {percentUsed}%
                </p>
                <div
                  role="progressbar"
                  aria-valuenow={percentUsed}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Daily allowance used"
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
                >
                  <div
                    className={cn("h-full rounded-full transition-all", barToneFor(percentUsed))}
                    style={{ width: `${percentUsed}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted">
                  {percentUsed >= 100
                    ? "You've used your whole allowance for today."
                    : "of today's allowance used."}
                </p>
                {usage.resetsAt && (
                  <p className="mt-1 text-xs text-muted">
                    Resets {formatTimeUntil(usage.resetsAt)}, at {formatLocalTime(usage.resetsAt)}.
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};
