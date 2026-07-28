import express from "express";
import { resolve } from "node:path";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { env } from "./config/env.js";
import passport, { configurePassport } from "./config/passport.js";
import { logger, morganStream } from "./config/logger.js";
import { generalLimiter } from "./middlewares/rateLimiter.js";
import { notFound, globalErrorHandler } from "./middlewares/errorHandler.js";
import apiRoutes from "./routes/index.js";

const app = express();

// Behind Render's proxy in prod, so req.ip and secure cookies resolve correctly.
if (env.isProduction) app.set("trust proxy", 1);

// ─── Security & parsing ───────────────────────────────

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      // No-Origin requests (curl, health checks, server-to-server) aren't a
      // browser CSRF vector, so they're allowed through.
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
      // Answer without CORS headers rather than throwing, so bots hitting the API
      // directly don't fill the logs with 500s. Log the origin though: a blocked
      // request fails silently in the browser, so without this line a wrong
      // CORS_ORIGINS on a new deployment is very hard to spot.
      logger.warn(`CORS blocked origin "${origin}". Allowed: ${env.corsOrigins.join(", ")}`);
      return callback(null, false);
    },
    credentials: true,
  }),
);

app.use(
  compression({
    filter: (req, res) => {
      // Compressing SSE buffers the response and breaks token streaming.
      const contentType = res.getHeader("Content-Type");
      if (typeof contentType === "string" && contentType.includes("text/event-stream"))
        return false;
      return compression.filter(req, res);
    },
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// Google OAuth only. No passport sessions: the callback issues our own JWT.
configurePassport();
app.use(passport.initialize());

app.use(morgan(env.isProduction ? "combined" : "dev", { stream: morganStream }));

app.use(generalLimiter);

// ─── Static uploads (avatars) ─────────────────────────
// The frontend is on a different origin, so relax helmet's same-origin CORP for
// these files. maxAge is safe because avatar filenames are random per upload.
app.use(
  "/uploads",
  express.static(resolve("uploads"), {
    maxAge: "7d",
    setHeaders: (response) => response.setHeader("Cross-Origin-Resource-Policy", "cross-origin"),
  }),
);

app.use("/api", apiRoutes);

// The error handler must stay last.
app.use(notFound);
app.use(globalErrorHandler);

export default app;
