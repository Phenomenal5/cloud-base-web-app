import type { RequestHandler } from "express";
import type { Schema } from "yup";
import { catchAsync } from "../utils/catchAsync.js";

// Validates req.body and replaces it with the parsed result, so controllers only
// ever see trimmed, coerced, known keys. A ValidationError bubbles up to the
// global handler as a 422.
export const validate = (schema: Schema): RequestHandler =>
  catchAsync(async (req, _res, next) => {
    req.body = await schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    next();
  });
