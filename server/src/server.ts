import app from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { logger } from "./config/logger.js";

// boot order: env validates itself on import, then the db has to answer, then we
// listen. both of those exit the process if they fail, so we never end up
// serving traffic in a half-broken state

async function start() {
  // prove the db is reachable before opening the port
  try {
    await prisma.$connect();
    logger.info("Database connected");
  } catch (error) {
    logger.error("Database connection failed at boot");
    logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    logger.info(`Nasight API listening on port ${env.port} [${env.nodeEnv}]`);
  });

  // let in-flight requests finish, then drop the db connection
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // log a stray rejection but keep serving, it's usually one bad request
  process.on("unhandledRejection", (reason) => {
    logger.error(`Unhandled promise rejection: ${String(reason)}`);
  });
  // an uncaught exception means state is unknown, so die and let the host restart us
  process.on("uncaughtException", (error) => {
    logger.error(`Uncaught exception: ${error.stack ?? error.message}`);
    process.exit(1);
  });
}

void start();
