import type { Request, Response, NextFunction } from "express";
import { ValidationError } from "yup";
import { Prisma } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

// Mounted after all routes.
export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

// P2002 unique violation, P2025 record not found, P2003 foreign key failure.
function fromPrismaKnownError(error: Prisma.PrismaClientKnownRequestError): AppError {
  switch (error.code) {
    case "P2002": {
      const target = (error.meta?.target as string[] | undefined)?.join(", ") ?? "field";
      return new AppError(`A record with that ${target} already exists.`, 409);
    }
    case "P2025":
      return new AppError("Record not found.", 404);
    case "P2003":
      return new AppError("Related record does not exist.", 400);
    default:
      return new AppError("Database request could not be completed.", 400);
  }
}

// The jsonwebtoken library throws plain Errors identified by name.
function isJwtError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError")
  );
}

// ─── Global error handler (mounted last) ──────────────
// Express identifies this as an error handler by its four arguments, so the
// unused `next` has to stay.
export function globalErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  let error: AppError;

  if (err instanceof AppError) {
    error = err;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    error = fromPrismaKnownError(err);
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    error = new AppError("Invalid data supplied to a database query.", 400);
  } else if (err instanceof ValidationError) {
    error = new AppError(err.errors.join(", "), 422);
  } else if (isJwtError(err)) {
    error = new AppError("Invalid or expired token. Please log in again.", 401);
  } else if (err instanceof Error && err.name === "MulterError") {
    error = new AppError(err.message, 400);
  } else {
    // Unknown or non-operational: don't leak internals to the client.
    error = new AppError("Something went wrong.", 500);
  }

  // Log the original error for anything server-side or unexpected.
  if (!error.isOperational || error.statusCode >= 500) {
    logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  }

  res.status(error.statusCode).json({
    status: error.status,
    message: error.message,
    ...(env.isProduction ? {} : { stack: err instanceof Error ? err.stack : undefined }),
  });
}
