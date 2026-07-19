// ─── Operational error ────────────────────────────────
//
// Errors we throw on purpose (bad input, not found, forbidden, quota exceeded).
// The global error handler trusts `isOperational` to decide whether a message
// is safe to expose to the client vs. hidden behind a generic 500.

export default class AppError extends Error {
  readonly statusCode: number;
  readonly status: "fail" | "error";
  readonly isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    // 4xx → client's fault ("fail"); 5xx → server's fault ("error").
    this.status = statusCode >= 500 ? "error" : "fail";
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
