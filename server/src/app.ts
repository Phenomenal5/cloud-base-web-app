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

// we sit behind render's proxy in prod. without this req.ip is the proxy's
// address, which would break the per-IP guest quota, and secure cookies too
if (env.isProduction) app.set("trust proxy", 1);

// ========== security and parsing ==================

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      // no Origin at all means curl, a health check or another server. those
      // aren't a browser CSRF risk, so let them through
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);

      // answer without the CORS headers instead of throwing, or every bot that
      // pokes the API fills the logs with 500s. but do log it: a blocked request
      // fails silently in the browser, so a wrong CORS_ORIGINS on a new deploy
      // is almost impossible to spot without this line
      logger.warn(`CORS blocked origin "${origin}". Allowed: ${env.corsOrigins.join(", ")}`);
      return callback(null, false);
    },
    credentials: true,
  }),
);

app.use(
  compression({
    filter: (req, res) => {
      // never compress SSE. it buffers the response and the tokens stop
      // arriving live, which kills the whole point of streaming
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

// google oauth only, and no passport sessions. the callback mints our own JWT
configurePassport();
app.use(passport.initialize());

app.use(morgan(env.isProduction ? "combined" : "dev", { stream: morganStream }));

app.use(generalLimiter);

// ========== serve the avatars ============
// the frontend is on another origin, so helmet's same-origin CORP has to be
// loosened for these. caching hard is fine, every upload gets a random filename
app.use(
  "/uploads",
  express.static(resolve("uploads"), {
    maxAge: "7d",
    setHeaders: (response) => response.setHeader("Cross-Origin-Resource-Policy", "cross-origin"),
  }),
);

app.use("/api", apiRoutes);

// these two stay at the bottom. express only reaches an error handler that's
// mounted after the routes it's meant to catch
app.use(notFound);
app.use(globalErrorHandler);

export default app;
