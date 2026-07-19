import type { Response } from "express";
import { env } from "../config/env.js";

// ─── Auth cookies ─────────────────────────────────────
//
// Tokens ride in httpOnly cookies so no JWT is ever exposed to client-side JS
// (house convention). In production the client (Vercel) and API (Render) are on
// different sites, so cross-site cookies need SameSite=None + Secure. In dev
// they're same-site on localhost, so Lax works over plain http.

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
  // Options (path/sameSite/secure) must match how the cookies were set, or the
  // browser won't clear them.
  res.clearCookie(COOKIE_NAMES.ACCESS, baseOptions());
  res.clearCookie(COOKIE_NAMES.REFRESH, baseOptions());
}
