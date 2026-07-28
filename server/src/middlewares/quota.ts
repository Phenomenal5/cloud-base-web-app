import type { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { dailyLimitFor, usedToday, quotaResetsAt } from "../services/queryLogService.js";
import { initSse, sendEvent } from "../utils/sse.js";

// ─── Daily query quota (FR-11/12) ─────────────────────
//
// Mount AFTER optionalAuth (it reads req.user). Refuses the request once the
// daily limit is reached — with a register prompt for guests (PRD §6.1). Stashes
// the remaining count on res.locals.quota for the controller to echo back so the
// UI can warn as the limit approaches.

export interface QuotaInfo {
  limit: number | null; // null = unlimited (admin)
  remaining: number | null;
  resetsAt: string | null; // ISO midnight UTC; null when unlimited
}

// With `trust proxy` set in prod, req.ip is the real client IP (guest identity).
export function clientIp(req: Request): string {
  return req.ip ?? "unknown";
}

// EventSource always sends this Accept header, and it's the only thing that
// distinguishes an SSE consumer here.
function wantsEventStream(req: Request): boolean {
  return Boolean(req.headers.accept?.includes("text/event-stream"));
}

// ─── Refusing an over-quota request ───────────────────
//
// NOTE: a plain 429 is INVISIBLE to the browser on this route. EventSource
// exposes neither the status code nor the body of a failed handshake — it just
// fires a bodyless `error`, indistinguishable from a dropped connection. That's
// why an exhausted user used to see "Connection lost. Please try again."
//
// So for SSE consumers we open the stream normally (200) and deliver the refusal
// as an `error` EVENT, which the client can actually read. Non-SSE callers still
// get a real 429 — the correct status for an API client.
function rejectOverQuota(
  req: Request,
  res: Response,
  details: { limit: number; used: number; isGuest: boolean },
): void {
  const resetsAt = quotaResetsAt();
  const message = details.isGuest
    ? `You've used all ${details.limit} free ${details.limit === 1 ? "question" : "questions"} for today.`
    : `You've used all ${details.limit} of your questions for today.`;

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

  // Remaining once this query completes.
  res.locals.quota = {
    limit,
    remaining: Math.max(0, limit - used - 1),
    resetsAt: quotaResetsAt().toISOString(),
  } satisfies QuotaInfo;
  next();
});
