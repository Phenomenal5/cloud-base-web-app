import type { Request } from "express";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { dailyLimitFor, usedToday } from "../services/queryLogService.js";

// ─── Daily query quota (FR-11/12) ─────────────────────
//
// Mount AFTER optionalAuth (it reads req.user). Rejects with 429 once the daily
// limit is reached — with a register prompt for guests (PRD §6.1). Stashes the
// remaining count on res.locals.quota for the controller to echo back so the UI
// can warn as the limit approaches.

export interface QuotaInfo {
  limit: number | null; // null = unlimited (admin)
  remaining: number | null;
}

// With `trust proxy` set in prod, req.ip is the real client IP (guest identity).
export function clientIp(req: Request): string {
  return req.ip ?? "unknown";
}

export const enforceQueryQuota = catchAsync(async (req, res, next) => {
  const limit = dailyLimitFor(req.user?.role);

  if (limit === null) {
    res.locals.quota = { limit: null, remaining: null } satisfies QuotaInfo;
    return next();
  }

  const identity = req.user ? { userId: req.user.id } : { ip: clientIp(req) };
  const used = await usedToday(identity);

  if (used >= limit) {
    const message = req.user
      ? `You've reached your daily query limit (${limit}). Please try again tomorrow.`
      : `You've used your ${limit} free ${limit === 1 ? "query" : "queries"}. Please register to continue.`;
    throw new AppError(message, 429);
  }

  // Remaining once this query completes.
  res.locals.quota = { limit, remaining: Math.max(0, limit - used - 1) } satisfies QuotaInfo;
  next();
});
