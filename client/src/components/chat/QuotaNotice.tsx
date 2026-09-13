"use client";

import Link from "next/link";
import { TimerReset, UserPlus } from "lucide-react";
import type { StreamError } from "@/lib/chatStream";
import { formatLocalTime, formatTimeUntil } from "@/lib/utils";

interface QuotaNoticeProps {
  error: StreamError;
}

// amber not red, on purpose. nothing is broken, they've just used what they had.
// the only useful thing here is when they get more, so lead with the reset time
export const QuotaNotice = ({ error }: QuotaNoticeProps) => {
  const { resetsAt, isGuest } = error;

  return (
    <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/30">
      <div className="flex gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
          <TimerReset className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{error.message}</p>

          {resetsAt && (
            <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/70">
              You can ask again {formatTimeUntil(resetsAt)}, when your allowance resets at{" "}
              {formatLocalTime(resetsAt)}.
            </p>
          )}

          {isGuest && (
            <>
              <p className="mt-2 text-sm text-amber-800/90 dark:text-amber-200/70">
                Signing up is free and gives you a much larger daily allowance, plus your
                conversations get saved.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-contrast transition hover:bg-brand-hover"
                >
                  <UserPlus className="h-4 w-4" /> Create a free account
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-900 transition hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-200 dark:hover:bg-amber-500/10"
                >
                  Sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
