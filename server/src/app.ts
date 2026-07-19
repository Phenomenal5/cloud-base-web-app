import express from "express";
import { resolve } from "node:path";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { env } from "./config/env.js";
import passport, { configurePassport } from "./config/passport.js";
import { morganStream } from "./config/logger.js";
import { generalLimiter } from "./middlewares/rateLimiter.js";
import { notFound, globalErrorHandler } from "./middlewares/errorHandler.js";
import apiRoutes from "./routes/index.js";

// ─── Express app ──────────────────────────────────────
// Middleware order matters: security & parsing → observability → rate limit →
// routes → 404 → error handler (which MUST be mounted last).

const app = express();

// Behind Render's proxy in prod so req.ip and secure cookies resolve correctly.
if (env.isProduction) app.set("trust proxy", 1);

// ── Security & parsing ────────────────────────────────
app.use(helmet());
app.use(
  cors({
    // Explicit allowlist. Also allow no-Origin requests (curl, health checks,
    // server-to-server) — those aren't browser CSRF vectors.
    origin(origin, callback) {
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
      // Don't set CORS headers for disallowed origins (browser blocks) instead
      // of throwing — avoids noisy 500s from bots hitting the API directly.
      return callback(null, false);
    },
    credentials: true, // auth will use an httpOnly cookie
  }),
);
app.use(
  compression({
    // Never compress SSE — buffering breaks live token streaming (/api/ask).
    filter: (req, res) => {
      const type = res.getHeader("Content-Type");
      if (typeof type === "string" && type.includes("text/event-stream")) return false;
      return compression.filter(req, res);
    },
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Passport for Google OAuth (stateless — no sessions). Registers the strategy
// only if configured; the strategy mints no session, the callback issues our JWT.
configurePassport();
app.use(passport.initialize());

// ── Observability ─────────────────────────────────────
app.use(morgan(env.isProduction ? "combined" : "dev", { stream: morganStream }));

// ── Rate limiting (global baseline) ───────────────────
app.use(generalLimiter);

// ── Static uploads (avatars) ──────────────────────────
// Served with a cross-origin resource policy so the frontend (a different origin)
// can display avatar images past helmet's default same-origin CORP.
app.use(
  "/uploads",
  express.static(resolve("uploads"), {
    setHeaders: (response) => response.setHeader("Cross-Origin-Resource-Policy", "cross-origin"),
  }),
);

// ── Routes ────────────────────────────────────────────
app.use("/api", apiRoutes);

// ── 404 + centralized error handler (LAST) ────────────
app.use(notFound);
app.use(globalErrorHandler);

export default app;
