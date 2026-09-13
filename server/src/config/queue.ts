import { PgBoss } from "pg-boss";
import { env } from "./env.js";
import { logger } from "./logger.js";

// the queue runs on postgres, so there's no redis or rabbit to deploy. pg-boss
// keeps its own `pgboss` schema out of our way. the API only ever pushes jobs,
// src/worker.ts is what pulls them

export const INGESTION_QUEUE = "corpus-ingestion";
export const METRICS_QUEUE = "metrics-maintenance";

let boss: PgBoss | null = null;

// one shared instance, created on first use
export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;

  boss = new PgBoss({ connectionString: env.queueDatabaseUrl });
  boss.on("error", (error: Error) => logger.error(`pg-boss: ${error.message}`));
  await boss.start();

  // safe to call every boot, createQueue does nothing if it already exists
  await boss.createQueue(INGESTION_QUEUE);
  await boss.createQueue(METRICS_QUEUE);
  return boss;
}

export async function stopBoss(): Promise<void> {
  if (boss) {
    await boss.stop();
    boss = null;
  }
}

export async function enqueueIngestion(jobId: string): Promise<void> {
  const instance = await getBoss();
  // retry with backoff, embedding calls fail for transient reasons often enough
  await instance.send(INGESTION_QUEUE, { jobId }, { retryLimit: 3, retryBackoff: true });
}

// 3am nightly. pg-boss stores the schedule in the db, so calling this once is
// enough and it survives worker restarts
export async function scheduleMetricsMaintenance(): Promise<void> {
  const instance = await getBoss();
  await instance.schedule(METRICS_QUEUE, "0 3 * * *");
}

export async function enqueueMetricsMaintenance(): Promise<void> {
  const instance = await getBoss();
  await instance.send(METRICS_QUEUE, {});
}
