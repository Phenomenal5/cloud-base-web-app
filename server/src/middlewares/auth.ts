import type { Request, Response, NextFunction, RequestHandler } from "express";
import { verifyAccessToken } from "../utils/tokens.js";
import { COOKIE_NAMES } from "../utils/cookies.js";
import AppError from "../utils/AppError.js";
import type { Role } from "../generated/prisma/enums.js";

function extractToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[COOKIE_NAMES.ACCESS];
  if (fromCookie) return fromCookie;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);

  return undefined;
}

// ─── protect: require a valid access token ────────────
//
// Reads the token from the httpOnly cookie (browsers) or a Bearer header (tools
// and tests). Verification is stateless, with no DB hit, so this scales
// horizontally. NOTE: the trade-off is that a blocked or demoted user keeps
// access until their access token expires (15 min by default). Both paths revoke
// the user's refresh tokens so the lock-out lands on their next refresh.
export function protect(req: Request, _res: Response, next: NextFunction): void {
  try {
    const token = extractToken(req);
    if (!token) throw new AppError("Not authenticated. Please log in.", 401);

    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (error) {
    // jwt.verify throws JsonWebTokenError / TokenExpiredError, which the global
    // handler maps to a 401.
    next(error);
  }
}

// ─── optionalAuth: attach the user if there is one ────
//
// For routes open to guests but richer when signed in, such as /api/ask.
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const token = extractToken(req);
    if (token) {
      const payload = verifyAccessToken(token);
      req.user = { id: payload.sub, role: payload.role };
    }
  } catch {
    // An invalid or expired token here just means "treat them as a guest".
  }
  next();
}

// ─── authorize: role check, mount after protect ───────
// NOTE: takes roles as rest args, so authorize("ADMIN"), not authorize(["ADMIN"]).
export const authorize =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new AppError("Not authenticated. Please log in.", 401));
    if (!roles.includes(req.user.role)) {
      return next(new AppError("You do not have permission to perform this action.", 403));
    }
    next();
  };
