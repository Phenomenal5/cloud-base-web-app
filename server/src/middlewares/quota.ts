import type { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { dailyLimitFor, usedToday, quotaResetsAt } from "../services/queryLogService.js";
import { initSse, sendEvent } from "../utils/sse.js";

// the daily question quota. mount this after optionalAuth, it reads req.user.
// stashes the day's usage on res.locals.quota for the controller to finish off

// what they'd used BEFORE this request ran.
//
// deliberately a raw `used`, not a pre-decremented "remaining". the old version
// stashed `limit - used - 1` here and streamed it straight out, which was wrong
// for every turn that never reaches logQuery. small talk isn't logged at all, so
// the count in the db never moved while the UI kept saying a question was spent.
// whether a turn costs anything is only known once the handler has classified
// it, so the client-facing number is built there, in buildQuotaInfo
export interface QuotaSnapshot {
  limit: number | null; // null means unlimited (admin)
  used: number;
  resetsAt: Date | null; // null when unlimited
}

// what actually goes to the client. the chat UI only draws `percentUsed`, the
// raw numbers stay in the payload for anything else reading the API
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

  // clamped, because two streams in flight can race the tally a hair past the
  // limit, and "31 of 30 used" just looks like a bug to whoever sees it
  const clampedUsed = Math.min(limit, used);

  return {
    limit,
    used: clampedUsed,
    remaining: Math.max(0, limit - clampedUsed),
    // guard the divisor. a misconfigured QUOTA_*_DAILY of 0 would make this NaN,
    // which serialises to null and reads as "unlimited", the exact opposite of
    // what a zero limit is supposed to mean
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
