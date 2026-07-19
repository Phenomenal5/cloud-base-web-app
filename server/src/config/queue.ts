import { PgBoss } from "pg-boss";
import { env } from "./env.js";
import { logger } from "./logger.js";

// ─── Background job queue (pg-boss) ───────────────────
//
// Postgres-backed queue — no extra infrastructure (PRD §10.2). pg-boss manages
// its own `pgboss` schema. The API server uses this only to enqueue; the worker
// process (src/worker.ts) consumes. Both call getBoss() against the same DB.

export const INGESTION_QUEUE = "corpus-ingestion";
export const METRICS_QUEUE = "metrics-maintenance";

let boss: PgBoss | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;

  boss = new PgBoss({ connectionString: env.queueDatabaseUrl });
  boss.on("error", (error: Error) => logger.error(`pg-boss: ${error.message}`));
  await boss.start();
  // Idempotent create — safe to call on every boot.
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

// Enqueue an ingestion job. Retries with backoff on failure (PRD §8.4).
export async function enqueueIngestion(jobId: string): Promise<void> {
  const instance = await getBoss();
  await instance.send(INGESTION_QUEUE, { jobId }, { retryLimit: 3, retryBackoff: true });
}

// Nightly metrics rollup + retention prune (03:00 UTC). pg-boss persists the
// cron schedule, so a single call is enough and it survives worker restarts.
export async function scheduleMetricsMaintenance(): Promise<void> {
  const instance = await getBoss();
  await instance.schedule(METRICS_QUEUE, "0 3 * * *");
}

// Fire the maintenance job now (e.g. once at worker boot for a prompt first roll-up).
export async function enqueueMetricsMaintenance(): Promise<void> {
  const instance = await getBoss();
  await instance.send(METRICS_QUEUE, {});
}
