import type { Request, Response, NextFunction, RequestHandler } from "express";

// Wrap every async controller so a rejected promise reaches the global error
// handler. That's what keeps try/catch out of the controllers.
export const catchAsync =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
