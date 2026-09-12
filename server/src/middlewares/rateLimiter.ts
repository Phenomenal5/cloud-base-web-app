import rateLimit from "express-rate-limit";

// In-memory store, since the stack has no Redis. Counts are per-instance, so
// swap in a Prisma-backed store if the API ever runs more than one.

const shared = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
} as const;

// Global baseline, applied to every request.
export const generalLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: { status: "fail", message: "Too many requests, please try again later." },
});

// Tighter window for login, registration, verification and password reset, to
// slow credential stuffing and brute-forcing of the 6-digit codes.
export const authLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { status: "fail", message: "Too many attempts, please try again later." },
});
