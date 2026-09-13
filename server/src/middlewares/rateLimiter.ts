import rateLimit from "express-rate-limit";

// counts live in memory, there's no redis in this stack. that means they're
// per-instance, so if the API ever runs more than one, swap in a prisma-backed
// store or the real limit becomes limit x instances

const shared = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
} as const;

// the baseline, every request goes through this
export const generalLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: { status: "fail", message: "Too many requests, please try again later." },
});

// much tighter, for login, register, verify and reset. slows down credential
// stuffing and stops anyone brute-forcing a 6-digit code
export const authLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { status: "fail", message: "Too many attempts, please try again later." },
});
