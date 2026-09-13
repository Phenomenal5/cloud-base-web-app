// the errors we throw on purpose: bad input, not found, forbidden, over quota.
// isOperational is the flag the global handler reads to decide whether this
// message is safe to show a user or should be swapped for a generic 500

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
