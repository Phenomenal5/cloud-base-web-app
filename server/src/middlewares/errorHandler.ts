import type { Request, Response, NextFunction } from "express";
import { ValidationError } from "yup";
import { Prisma } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";

// nothing matched, so turn it into a 404 the error handler below can format
export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

// turn prisma's error codes into something a client can read
function fromPrismaKnownError(error: Prisma.PrismaClientKnownRequestError): AppError {
  switch (error.code) {
    // unique constraint
    case "P2002": {
      const target = (error.meta?.target as string[] | undefined)?.join(", ") ?? "field";
      return new AppError(`A record with that ${target} already exists.`, 409);
    }
    // row not found
    case "P2025":
      return new AppError("Record not found.", 404);
    // foreign key
    case "P2003":
      return new AppError("Related record does not exist.", 400);
    default:
      return new AppError("Database request could not be completed.", 400);
  }
}

// jsonwebtoken throws plain Errors, so name is the only thing to match on
function isJwtError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError")
  );
}

// ========== global error handler, mounted last ==================
// express spots an error handler by counting four arguments, so `_next` has to
// stay even though nothing uses it
export function globalErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // work out what we're actually looking at, most specific first
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
    // something we didn't plan for. generic message, never the real one, that's
    // how stack traces and table names end up on a user's screen
    error = new AppError("Something went wrong.", 500);
  }

  // log the original for anything unexpected or server-side. operational 4xx
  // errors are normal and would just be noise
  if (!error.isOperational || error.statusCode >= 500) {
    logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  }

  // stack only outside production
  res.status(error.statusCode).json({
    status: error.status,
    message: error.message,
    ...(env.isProduction ? {} : { stack: err instanceof Error ? err.stack : undefined }),
  });
}
