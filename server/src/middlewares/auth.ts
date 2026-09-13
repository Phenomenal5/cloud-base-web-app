import type { Request, Response, NextFunction, RequestHandler } from "express";
import { verifyAccessToken } from "../utils/tokens.js";
import { COOKIE_NAMES } from "../utils/cookies.js";
import AppError from "../utils/AppError.js";
import type { Role } from "../generated/prisma/enums.js";

// cookie for browsers, Bearer header for tools and tests
function extractToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[COOKIE_NAMES.ACCESS];
  if (fromCookie) return fromCookie;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);

  return undefined;
}

// ========== require a valid token ==================
export function protect(req: Request, _res: Response, next: NextFunction): void {
  try {
    const token = extractToken(req);
    if (!token) throw new AppError("Not authenticated. Please log in.", 401);

    // verify only, no db hit, so this stays cheap and scales sideways. the
    // trade-off is that blocking someone doesn't bite until their token expires
    // (15 min). both block and demote revoke refresh tokens to cap that
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (error) {
    // jwt throws JsonWebTokenError / TokenExpiredError, the global handler turns
    // both into a 401
    next(error);
  }
}

// ========= attach the user only if there is one ===============
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  // for routes guests can use but that get better when signed in, like /api/ask
  try {
    const token = extractToken(req);
    if (token) {
      const payload = verifyAccessToken(token);
      req.user = { id: payload.sub, role: payload.role };
    }
  } catch {
    // swallowed on purpose. a bad or expired token here just means "guest"
  }
  next();
}

// ========== role check, mount after protect ============
// rest args: authorize("ADMIN"), not authorize(["ADMIN"])
export const authorize =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new AppError("Not authenticated. Please log in.", 401));
    if (!roles.includes(req.user.role)) {
      return next(new AppError("You do not have permission to perform this action.", 403));
    }
    next();
  };
