import rateLimit from "express-rate-limit";

// ─── Rate limiting ────────────────────────────────────
//
// A global baseline limiter to blunt abuse. Tighter per-route limiters (auth,
// query, password-reset) and the per-user / per-IP query quotas arrive with
// those features (PRD §8.1 / §8.5).
//
// NOTE: in-memory store on purpose — the PRD explicitly rules out Redis (§9.3).
// When the backend actually runs multiple instances, swap this for a
// Prisma-backed store so counts are shared. Simple first; scale when needed.

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 300, // per window per IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { status: "fail", message: "Too many requests, please try again later." },
});

// Stricter limiter for auth endpoints (login/register) to slow credential
// stuffing and brute force (PRD §8.1). Password-reset gets its own when built.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { status: "fail", message: "Too many attempts, please try again later." },
});
