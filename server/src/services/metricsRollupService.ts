import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

// ─── Metrics rollup + retention ───────────────────────
//
// The admin dashboard's all-time query/token totals come from two ever-growing
// tables (query_logs, token_usage). To keep those reads cheap and the tables
// bounded, the worker runs runMetricsMaintenance() nightly:
//   1. rollUpDailyMetrics() — fold each COMPLETED UTC day into one daily_metrics
//      row (idempotent upsert), so history survives step 2.
//   2. pruneOldData() — delete raw rows older than the retention window (already
//      captured in step 1) plus spent auth tokens.
// The dashboard then reads: sum(daily_metrics) [history] + today's live rows.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

interface QueryDayRow {
  day: string;
  kind: string;
  n: number;
}
interface TokenDayRow {
  day: string;
  operation: string;
  total: number;
  prompt: number;
  completion: number;
}

interface DayAggregate {
  queriesSearch: number;
  queriesAsk: number;
  tokensTotal: number;
  tokensPrompt: number;
  tokensCompletion: number;
  tokensByOperation: Record<string, number>;
}

function blankDay(): DayAggregate {
  return {
    queriesSearch: 0,
    queriesAsk: 0,
    tokensTotal: 0,
    tokensPrompt: 0,
    tokensCompletion: 0,
    tokensByOperation: {},
  };
}

// Re-roll the whole retained window each night rather than tracking a cursor —
// simpler and idempotent, and cheap because the window is bounded by retention.
// Only complete days (< today UTC) are rolled; today stays live.
export async function rollUpDailyMetrics(): Promise<number> {
  const todayStart = utcDayStart(new Date());
  const windowStart = new Date(todayStart.getTime() - env.metricsRetentionDays * MS_PER_DAY);

  // Grouping by a truncated date needs raw SQL (Prisma groupBy can't date_trunc);
  // both bounds are bound parameters, and the ::int casts avoid bigint returns.
  const queryRows = await prisma.$queryRaw<QueryDayRow[]>`
    SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
           kind::text AS kind,
           count(*)::int AS n
    FROM query_logs
    WHERE "createdAt" >= ${windowStart} AND "createdAt" < ${todayStart}
    GROUP BY 1, 2
  `;

  const tokenRows = await prisma.$queryRaw<TokenDayRow[]>`
    SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
           operation::text AS operation,
           sum("totalTokens")::int AS total,
           sum("promptTokens")::int AS prompt,
           sum("completionTokens")::int AS completion
    FROM token_usage
    WHERE "createdAt" >= ${windowStart} AND "createdAt" < ${todayStart}
    GROUP BY 1, 2
  `;

  const days = new Map<string, DayAggregate>();

  for (const row of queryRows) {
    const aggregate = days.get(row.day) ?? blankDay();
    if (row.kind === "SEARCH") aggregate.queriesSearch = row.n;
    else if (row.kind === "ASK") aggregate.queriesAsk = row.n;
    days.set(row.day, aggregate);
  }
  for (const row of tokenRows) {
    const aggregate = days.get(row.day) ?? blankDay();
    aggregate.tokensTotal += row.total;
    aggregate.tokensPrompt += row.prompt;
    aggregate.tokensCompletion += row.completion;
    aggregate.tokensByOperation[row.operation] =
      (aggregate.tokensByOperation[row.operation] ?? 0) + row.total;
    days.set(row.day, aggregate);
  }

  for (const [day, aggregate] of days) {
    await prisma.dailyMetric.upsert({
      where: { day },
      create: { day, ...aggregate },
      update: { ...aggregate },
    });
  }
  return days.size;
}

// Delete data past the retention window (raw audit rows) or otherwise spent.
// query_logs / token_usage older than retention are already in daily_metrics.
export async function pruneOldData(): Promise<void> {
  const now = new Date();
  const retentionCutoff = new Date(now.getTime() - env.metricsRetentionDays * MS_PER_DAY);

  const [queryLogs, tokenUsage] = await Promise.all([
    prisma.queryLog.deleteMany({ where: { createdAt: { lt: retentionCutoff } } }),
    prisma.tokenUsage.deleteMany({ where: { createdAt: { lt: retentionCutoff } } }),
  ]);

  // Spent/expired auth artifacts — single-use or dead, no history to keep. Only
  // EXPIRED refresh tokens are removed (not merely revoked), leaving room for a
  // future reuse-detection grace window.
  await Promise.all([
    prisma.emailVerificationToken.deleteMany({
      where: { OR: [{ consumedAt: { not: null } }, { expiresAt: { lt: now } }] },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { OR: [{ consumedAt: { not: null } }, { expiresAt: { lt: now } }] },
    }),
    prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);

  logger.info(
    `Metrics prune: removed ${queryLogs.count} query logs and ${tokenUsage.count} token rows older than ${env.metricsRetentionDays}d.`,
  );
}

export async function runMetricsMaintenance(): Promise<void> {
  const rolledDays = await rollUpDailyMetrics();
  await pruneOldData();
  logger.info(`Metrics maintenance complete — rolled up ${rolledDays} day(s).`);
}
