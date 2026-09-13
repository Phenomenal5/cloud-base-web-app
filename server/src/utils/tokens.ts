import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import type { Role } from "../generated/prisma/enums.js";

// two kinds of token in here:
//   access  - short-lived JWT holding { sub, role }, never stored anywhere
//   refresh - long random string. we only keep its sha256, and the db row is
//             what decides whether it's expired or revoked

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  // pin the algorithm on both sign and verify. letting the token's own header
  // pick is how alg-confusion and "alg: none" attacks get in
  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessTtlSeconds,
    algorithm: "HS256",
  });
}

// throws if it's invalid or expired, and the global handler turns that into a 401
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret, { algorithms: ["HS256"] }) as AccessTokenPayload;
}

// raw value goes out in the cookie, only the hash goes in the db
export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + env.refreshTtlDays * 24 * 60 * 60 * 1000);
}

// the 6-digit code people type in. only a million options, which is weak on its
// own, so the protection is the short TTL plus single use plus authLimiter.
// randomInt not Math.random, Math.random is predictable
export function generateVerificationCode(): { code: string; hash: string } {
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  return { code, hash: hashToken(code) };
}

export function verificationCodeExpiry(): Date {
  return new Date(Date.now() + env.verificationCodeTtlMinutes * 60 * 1000);
}

export function passwordResetExpiry(): Date {
  return new Date(Date.now() + env.passwordResetTtlMinutes * 60 * 1000);
}
