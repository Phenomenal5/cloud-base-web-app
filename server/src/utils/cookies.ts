import type { Response } from "express";
import { env } from "../config/env.js";

// Tokens ride in httpOnly cookies so no JWT is ever readable from client JS.
// In production the client and API are on different sites, which needs
// SameSite=None + Secure; in dev they're both on localhost, so Lax works
// over plain http.

export const COOKIE_NAMES = {
  ACCESS: "accessToken",
  REFRESH: "refreshToken",
} as const;

function baseOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? ("none" as const) : ("lax" as const),
    path: "/",
  };
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
): void {
  res.cookie(COOKIE_NAMES.ACCESS, tokens.accessToken, {
    ...baseOptions(),
    maxAge: env.jwtAccessTtlSeconds * 1000,
  });
  res.cookie(COOKIE_NAMES.REFRESH, tokens.refreshToken, {
    ...baseOptions(),
    maxAge: env.refreshTtlDays * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  // Options must match how the cookies were set, or the browser won't clear them.
  res.clearCookie(COOKIE_NAMES.ACCESS, baseOptions());
  res.clearCookie(COOKIE_NAMES.REFRESH, baseOptions());
}
