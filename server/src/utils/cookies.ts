import type { Response } from "express";
import { env } from "../config/env.js";

// tokens live in httpOnly cookies, so no JS on the page can ever read a JWT

export const COOKIE_NAMES = {
  ACCESS: "accessToken",
  REFRESH: "refreshToken",
} as const;

function baseOptions() {
  // in prod the client and API are on different domains, which forces
  // SameSite=None + Secure. in dev they're both localhost so Lax works over http

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
  // options have to match how they were set or the browser ignores the clear
  res.clearCookie(COOKIE_NAMES.ACCESS, baseOptions());
  res.clearCookie(COOKIE_NAMES.REFRESH, baseOptions());
}
