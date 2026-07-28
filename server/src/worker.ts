import {
  getBoss,
  stopBoss,
  INGESTION_QUEUE,
  METRICS_QUEUE,
  scheduleMetricsMaintenance,
  enqueueMetricsMaintenance,
} from "./config/queue.js";
import { processIngestionJob } from "./services/ingestionJobService.js";
import { runMetricsMaintenance } from "./services/metricsRollupService.js";
import { prisma } from "./config/prisma.js";
import { logger } from "./config/logger.js";

// Deployed as its own service. Shares the server's codebase but runs ingestion
// and nightly maintenance off the request path. Start it with `npm run worker`.

async function start() {
  try {
    await prisma.$connect();
  } catch (error) {
    logger.error("Worker: database connection failed at boot");
    logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(1);
  }

  const boss = await getBoss();

  // pg-boss hands the handler a batch, not a single job.
  await boss.work(INGESTION_QUEUE, async (jobs) => {
    for (const job of jobs) {
      const { jobId } = job.data as { jobId: string };
      await processIngestionJob(jobId);
    }
  });

  await boss.work(METRICS_QUEUE, async () => {
    await runMetricsMaintenance();
  });
  await scheduleMetricsMaintenance();
  // Run one pass now, so a fresh deploy has rollups without waiting for 03:00.
  await enqueueMetricsMaintenance();

  logger.info(`Worker listening on queues "${INGESTION_QUEUE}" and "${METRICS_QUEUE}"`);

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, worker shutting down`);
    await stopBoss();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch((error) => {
  logger.error(`Worker failed to start: ${error instanceof Error ? error.stack : String(error)}`);
  process.exit(1);
});
