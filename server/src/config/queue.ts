import { PgBoss } from "pg-boss";
import { env } from "./env.js";
import { logger } from "./logger.js";

// Postgres-backed queue, so there's no extra infrastructure to run. pg-boss owns
// its own `pgboss` schema. The API only enqueues; src/worker.ts consumes.

export const INGESTION_QUEUE = "corpus-ingestion";
export const METRICS_QUEUE = "metrics-maintenance";

let boss: PgBoss | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;

  boss = new PgBoss({ connectionString: env.queueDatabaseUrl });
  boss.on("error", (error: Error) => logger.error(`pg-boss: ${error.message}`));
  await boss.start();
  // Both are idempotent, so calling them on every boot is fine.
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
  await instance.send(INGESTION_QUEUE, { jobId }, { retryLimit: 3, retryBackoff: true });
}

// pg-boss persists the cron schedule, so one call is enough and it survives
// worker restarts.
export async function scheduleMetricsMaintenance(): Promise<void> {
  const instance = await getBoss();
  await instance.schedule(METRICS_QUEUE, "0 3 * * *");
}

export async function enqueueMetricsMaintenance(): Promise<void> {
  const instance = await getBoss();
  await instance.send(METRICS_QUEUE, {});
}
