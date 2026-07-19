import winston from "winston";
import { env } from "./env.js";

// ─── Structured logging (Winston) ─────────────────────
//
// Human-readable colorized lines in dev; structured JSON in prod for log
// aggregation (PRD §8.9). Morgan pipes HTTP request lines through this same
// logger so application and request logs share one stream.

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack }) => `${ts} ${level}: ${stack || message}`),
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

export const logger = winston.createLogger({
  // "http" in prod so request logs are kept; "debug" in dev for everything.
  level: env.isProduction ? "http" : "debug",
  format: env.isProduction ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  silent: env.isTest,
});

// Adapter so Morgan writes through Winston instead of straight to stdout.
export const morganStream = {
  write: (message: string) => logger.http(message.trim()),
};
