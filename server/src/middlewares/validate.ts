import type { RequestHandler } from "express";
import type { Schema } from "yup";
import { catchAsync } from "../utils/catchAsync.js";

// ─── Request body validation (Yup) ────────────────────
//
// Validates and normalizes req.body against a Yup schema, then replaces the body
// with the parsed result (trimmed/lowercased/coerced, unknown keys stripped).
// A ValidationError bubbles to the global handler → 422.

export const validate = (schema: Schema): RequestHandler =>
  catchAsync(async (req, _res, next) => {
    req.body = await schema.validate(req.body, {
      abortEarly: false, // collect all errors, not just the first
      stripUnknown: true, // drop keys the schema doesn't declare
    });
    next();
  });
