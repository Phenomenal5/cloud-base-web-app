import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import type { Role } from "../generated/prisma/enums.js";

// ─── Tokens ───────────────────────────────────────────
//
// Two token types (FR-6):
//   • access  — a short-lived, stateless JWT carrying { sub, role }. Not stored.
//   • refresh — a long-lived opaque random string. We store only its SHA-256
//               hash (FR-7); the DB record is the source of truth for expiry
//               and revocation.

export interface AccessTokenPayload {
  sub: string; // user id
  role: Role;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  // Pin the algorithm explicitly on both sign and verify — never let the token's
  // own header pick it (guards against alg-confusion / "alg: none").
  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessTtlSeconds,
    algorithm: "HS256",
  });
}

// Throws (JsonWebTokenError / TokenExpiredError) on invalid/expired tokens —
// the global error handler maps those to 401.
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret, { algorithms: ["HS256"] }) as AccessTokenPayload;
}

// Raw value goes to the client (in an httpOnly cookie); only the hash is stored.
export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// Absolute expiry for a newly issued refresh token.
export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + env.refreshTtlDays * 24 * 60 * 60 * 1000);
}

// ─── Email verification codes ─────────────────────────
// 6-digit numeric code the user types on the frontend. Low entropy by design
// (short, human-typable) — brute force is contained by a short TTL, single use,
// and the auth rate limiter. Only the hash is stored.
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
