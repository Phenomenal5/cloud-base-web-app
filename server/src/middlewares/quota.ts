import type { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { dailyLimitFor, usedToday, quotaResetsAt } from "../services/queryLogService.js";
import { initSse, sendEvent } from "../utils/sse.js";

// Daily query quota. Mount after optionalAuth, it reads req.user. Stashes the
// day's usage on res.locals.quota for the controller to finalise.

// Usage as it stood BEFORE this request.
//
// Raw `used`, not a pre-decremented "remaining". Small talk never reaches
// logQuery, so a pre-decrement showed a question spent that the DB never
// recorded. Only the handler knows if a turn counted, so buildQuotaInfo runs there.
export interface QuotaSnapshot {
  limit: number | null; // null means unlimited (admin)
  used: number;
  resetsAt: Date | null; // null when unlimited
}

// What the client is shown. The chat UI renders `percentUsed` only; the raw
// numbers stay in the payload for other API consumers.
export interface QuotaInfo {
  limit: number | null;
  used: number;
  remaining: number | null;
  percentUsed: number | null; // 0 to 100, null when unlimited
  resetsAt: string | null; // ISO midnight UTC, null when unlimited
}

// `consumed` is what this request logged: 1 for an answered question, 0 for
// small talk or a failed write.
export function buildQuotaInfo(snapshot: QuotaSnapshot, consumed: number): QuotaInfo {
  const { limit } = snapshot;
  const used = snapshot.used + consumed;

  if (limit === null) {
    return { limit: null, used, remaining: null, percentUsed: null, resetsAt: null };
  }

  // Clamped: two in-flight streams can race past the limit, and "31 of 30" reads
  // as a bug.
  const clampedUsed = Math.min(limit, used);

  return {
    limit,
    used: clampedUsed,
    remaining: Math.max(0, limit - clampedUsed),
    // Guard the divisor. A QUOTA_*_DAILY of 0 gives NaN, which serialises to null
    // and reads as unlimited, the opposite of what it means.
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

// A plain 429 is invisible to EventSource: it exposes neither status nor body,
// just a bodyless `error` that looks like a dropped connection. So SSE consumers
// get a 200 stream carrying a readable `error` event. Everyone else gets the 429.
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
