import type { RequestHandler } from "express";
import type { Schema } from "yup";
import { catchAsync } from "../utils/catchAsync.js";

// check req.body against a schema and swap in the parsed version, so controllers
// only ever see trimmed, coerced, known keys. a failure throws ValidationError,
// which the global handler turns into a 422
export const validate = (schema: Schema): RequestHandler =>
  catchAsync(async (req, _res, next) => {
    // abortEarly false so they get every problem at once, not one per round trip
    req.body = await schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });
    next();
  });
