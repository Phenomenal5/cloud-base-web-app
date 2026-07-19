import app from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { logger } from "./config/logger.js";

// ─── Boot ─────────────────────────────────────────────
//
// Order: env is validated on import (config/env) → verify the DB is reachable →
// start listening. Fail fast & loud on either so we never serve traffic against
// a broken config or an unreachable database.

async function start() {
  try {
    await prisma.$connect();
    logger.info("✔ Database connected");
  } catch (error) {
    logger.error("✖ Database connection failed at boot");
    logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    logger.info(`✔ AeroLens API listening on http://localhost:${env.port} [${env.nodeEnv}]`);
  });

  // Graceful shutdown: stop accepting connections, then close the DB pool.
  const shutdown = (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(() => {
      void prisma.$disconnect().finally(() => {
        logger.info("Closed HTTP server and DB connection");
        process.exit(0);
      });
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Last-resort safety nets: log and exit rather than run in an unknown state.
  process.on("unhandledRejection", (reason) => {
    logger.error(`Unhandled promise rejection: ${String(reason)}`);
  });
  process.on("uncaughtException", (error) => {
    logger.error(`Uncaught exception: ${error.stack ?? error.message}`);
    process.exit(1);
  });
}

void start();
