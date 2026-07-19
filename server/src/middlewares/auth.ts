import type { Request, Response, NextFunction, RequestHandler } from "express";
import { verifyAccessToken } from "../utils/tokens.js";
import { COOKIE_NAMES } from "../utils/cookies.js";
import AppError from "../utils/AppError.js";
import type { Role } from "../generated/prisma/enums.js";

// ─── protect: require a valid access token ────────────
//
// Reads the access token from the httpOnly cookie (browser clients) or an
// `Authorization: Bearer` header (tools/tests), verifies it, and attaches
// `req.user`. Stateless on purpose — no DB hit — so it scales horizontally.
// NOTE: because it's stateless, a blocked user keeps access until their access
// token expires (≤15 min). Immediate lock-out is enforced at login/refresh plus
// refresh-token revocation when an admin blocks the account.
export function protect(req: Request, _res: Response, next: NextFunction): void {
  try {
    const token = extractToken(req);
    if (!token) throw new AppError("Not authenticated. Please log in.", 401);

    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (error) {
    // jwt.verify throws JsonWebTokenError / TokenExpiredError → global handler
    // turns those into 401.
    next(error);
  }
}

// ─── optionalAuth: attach user if present, never reject ──
//
// For endpoints open to guests but richer when signed in (e.g. /api/ask, which
// persists messages for logged-in users but still answers guests). Sets req.user
// when a valid token is present; silently continues as a guest otherwise.
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const token = extractToken(req);
    if (token) {
      const payload = verifyAccessToken(token);
      req.user = { id: payload.sub, role: payload.role };
    }
  } catch {
    // Invalid/expired token on an optional route → treat as guest, don't error.
  }
  next();
}

function extractToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[COOKIE_NAMES.ACCESS];
  if (fromCookie) return fromCookie;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);

  return undefined;
}

// ─── authorize: restrict to specific roles (RBAC, FR-9) ──
//
// Mount AFTER `protect`. NOTE: takes roles as rest args — authorize("ADMIN"),
// NOT authorize(["ADMIN"]). Returns 403 for an authenticated user lacking a role.
export const authorize =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new AppError("Not authenticated. Please log in.", 401));
    if (!roles.includes(req.user.role)) {
      return next(new AppError("You do not have permission to perform this action.", 403));
    }
    next();
  };
