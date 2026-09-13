import winston from "winston";
import { env } from "./env.js";

// coloured lines in dev, JSON in prod so a log aggregator can parse it. morgan
// writes through here too, so HTTP and app logs come out one stream

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: time, stack }) => `${time} ${level}: ${stack || message}`),
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

export const logger = winston.createLogger({
  // http in prod so request logs survive, debug in dev so everything does
  level: env.isProduction ? "http" : "debug",
  format: env.isProduction ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  silent: env.isTest,
});

export const morganStream = {
  write: (message: string) => logger.http(message.trim()),
};
