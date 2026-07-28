import type { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { dailyLimitFor, usedToday, quotaResetsAt } from "../services/queryLogService.js";
import { initSse, sendEvent } from "../utils/sse.js";

// Daily query quota. Mount after optionalAuth, since it reads req.user. Stashes
// the remaining count on res.locals.quota for the controller to echo back, so the
// UI can warn as the limit approaches.

export interface QuotaInfo {
  limit: number | null; // null means unlimited (admin)
  remaining: number | null;
  resetsAt: string | null; // ISO midnight UTC, null when unlimited
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
    res.locals.quota = { limit: null, remaining: null, resetsAt: null } satisfies QuotaInfo;
    return next();
  }

  const identity = req.user ? { userId: req.user.id } : { ip: clientIp(req) };
  const used = await usedToday(identity);

  if (used >= limit) {
    return rejectOverQuota(req, res, { limit, used, isGuest: !req.user });
  }

  // What's left once this query completes.
  res.locals.quota = {
    limit,
    remaining: Math.max(0, limit - used - 1),
    resetsAt: quotaResetsAt().toISOString(),
  } satisfies QuotaInfo;
  next();
});
