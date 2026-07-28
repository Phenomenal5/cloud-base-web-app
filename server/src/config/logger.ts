import winston from "winston";
import { env } from "./env.js";

// Colourized lines in dev, JSON in prod for log aggregation. Morgan writes
// through this too, so HTTP and application logs share one stream.

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: time, stack }) => `${time} ${level}: ${stack || message}`),
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

export const logger = winston.createLogger({
  // "http" in prod keeps request logs; "debug" in dev keeps everything.
  level: env.isProduction ? "http" : "debug",
  format: env.isProduction ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  silent: env.isTest,
});

export const morganStream = {
  write: (message: string) => logger.http(message.trim()),
};
