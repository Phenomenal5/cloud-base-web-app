import type { Request, Response, NextFunction, RequestHandler } from "express";

// wrap every async handler in this. a rejected promise then lands on the global
// error handler instead of vanishing, which is what keeps try/catch out of the
// controllers entirely
export const catchAsync =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
