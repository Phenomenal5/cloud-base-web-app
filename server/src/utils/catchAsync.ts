import type { Request, Response, NextFunction, RequestHandler } from "express";

// ─── Async handler wrapper ────────────────────────────
//
// Wrap every async controller so a rejected promise is forwarded to the global
// error handler via next(err) — no try/catch in controllers.
//
//   router.get("/", catchAsync(async (req, res) => { ... }))

export const catchAsync =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
