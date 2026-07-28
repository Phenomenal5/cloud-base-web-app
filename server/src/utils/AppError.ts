// Errors we throw deliberately: bad input, not found, forbidden, over quota.
// The global handler uses isOperational to decide whether the message is safe to
// show the client or should be hidden behind a generic 500.

export default class AppError extends Error {
  readonly statusCode: number;
  readonly status: "fail" | "error";
  readonly isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode >= 500 ? "error" : "fail";
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}
