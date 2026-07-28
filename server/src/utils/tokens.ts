import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import type { Role } from "../generated/prisma/enums.js";

// Two token types:
//   access  - short-lived stateless JWT carrying { sub, role }, never stored.
//   refresh - long-lived opaque random string. Only its SHA-256 hash is stored,
//             and the DB row is the source of truth for expiry and revocation.

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  // NOTE: pin the algorithm on both sign and verify. Letting the token's own
  // header choose is how alg-confusion and "alg: none" attacks get in.
  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessTtlSeconds,
    algorithm: "HS256",
  });
}

// Throws on an invalid or expired token; the global handler turns that into a 401.
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret, { algorithms: ["HS256"] }) as AccessTokenPayload;
}

// The raw value goes to the client in an httpOnly cookie; only the hash is stored.
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

// 6-digit code the user types in. Low entropy by design (it has to be typable),
// so brute force is contained by the short TTL, single use, and the auth limiter.
// randomInt is the CSPRNG; Math.random would be guessable.
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
