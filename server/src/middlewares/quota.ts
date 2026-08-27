import type { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { dailyLimitFor, usedToday, quotaResetsAt } from "../services/queryLogService.js";
import { initSse, sendEvent } from "../utils/sse.js";

// Daily query quota. Mount after optionalAuth, since it reads req.user. Stashes
// the day's usage so far on res.locals.quota, for the controller to turn into a
// figure the UI can show once it knows whether this turn actually counted.

// The day's usage as it stood BEFORE this request ran.
//
// NOTE: deliberately a raw `used`, not a pre-decremented "remaining". The old
// version stashed `limit - used - 1` here and streamed it straight to the client,
// which was wrong for every turn that never reaches logQuery — small talk isn't
// logged at all, so the count in the DB never moved while the UI kept reporting
// a question spent. Since each turn re-reads `used`, the number the user saw
// stuck at that first phantom decrement. Whether a turn consumes an allowance is
// only known after the handler classifies it, so the client-facing figure is
// built there, via buildQuotaInfo, once the answer is logged.
export interface QuotaSnapshot {
  limit: number | null; // null means unlimited (admin)
  used: number;
  resetsAt: Date | null; // null when unlimited
}

// What the client is shown. The chat UI renders `percentUsed` and nothing else;
// the raw numbers stay in the payload for the API's own consumers.
export interface QuotaInfo {
  limit: number | null;
  used: number;
  remaining: number | null;
  percentUsed: number | null; // 0–100, null when unlimited
  resetsAt: string | null; // ISO midnight UTC, null when unlimited
}

// `consumed` is how many queries this request actually logged: 1 for an answered
// question, 0 for small talk or a write that failed.
export function buildQuotaInfo(snapshot: QuotaSnapshot, consumed: number): QuotaInfo {
  const { limit } = snapshot;
  const used = snapshot.used + consumed;

  if (limit === null) {
    return { limit: null, used, remaining: null, percentUsed: null, resetsAt: null };
  }

  // Clamped, because a race between two in-flight streams can push the tally a
  // hair past the limit, and "31 of 30 used" reads as a bug to the person seeing it.
  const clampedUsed = Math.min(limit, used);

  return {
    limit,
    used: clampedUsed,
    remaining: Math.max(0, limit - clampedUsed),
    // NOTE: guard the divisor. A misconfigured QUOTA_*_DAILY of 0 would otherwise
    // make this NaN, which serialises to null and reads as "unlimited" — the exact
    // opposite of what a zero limit means.
    percentUsed: limit > 0 ? Math.round((clampedUsed / limit) * 100) : 100,
    resetsAt: (snapshot.resetsAt ?? quotaResetsAt()).toISOString(),
  };
}

// `trust proxy` is set in production, so req.ip is the real client address.
export function clientIp(req: Request): string {
  return req.ip ?? "unknown";
}

function wantsEventStream(req: Request): boolean {
  return Boolean(req.headers.accept?.includes("text/event-stream"));
}

// NOTE: a plain 429 is invisible to EventSource. It exposes neither the status
// code nor the body of a failed handshake, just a bodyless `error` that looks
// exactly like a dropped connection, which is why an exhausted user used to see
// "Connection lost". So SSE consumers get a normal 200 stream carrying an `error`
// event they can actually read. Everyone else gets the real 429.
function rejectOverQuota(
  req: Request,
  res: Response,
  details: { limit: number; used: number; isGuest: boolean },
): void {
  const resetsAt = quotaResetsAt();
  const questions = details.limit === 1 ? "question" : "questions";
  const message = details.isGuest
    ? `You've used all ${details.limit} free ${questions} for today.`
    : `You've used all ${details.limit} of your ${questions} for today.`;

  if (wantsEventStream(req)) {
    initSse(res);
    sendEvent(res, "error", {
      code: "QUOTA_EXCEEDED",
      message,
      limit: details.limit,
      used: details.used,
      resetsAt: resetsAt.toISOString(),
      isGuest: details.isGuest,
    });
    res.end();
    return;
  }

  throw new AppError(`${message} Access resets at midnight UTC.`, 429);
}

export const enforceQueryQuota = catchAsync(async (req, res, next) => {
  const limit = dailyLimitFor(req.user?.role);

  if (limit === null) {
    res.locals.quota = { limit: null, used: 0, resetsAt: null } satisfies QuotaSnapshot;
    return next();
  }

  const identity = req.user ? { userId: req.user.id } : { ip: clientIp(req) };
  const used = await usedToday(identity);

  if (used >= limit) {
    return rejectOverQuota(req, res, { limit, used, isGuest: !req.user });
  }

  res.locals.quota = { limit, used, resetsAt: quotaResetsAt() } satisfies QuotaSnapshot;
  next();
});
