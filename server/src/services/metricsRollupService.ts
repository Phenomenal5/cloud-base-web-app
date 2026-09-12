import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

// The admin dashboard's all-time totals come from two tables that grow forever
// (query_logs, token_usage). To keep those reads cheap, the worker runs this
// nightly: fold every completed UTC day into one daily_metrics row, then delete
// the raw rows past the retention window. The dashboard reads
// sum(daily_metrics) plus today's live rows.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

interface QueryDayRow {
  day: string;
  kind: string;
  count: number;
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

// Re-rolls the whole retained window each night instead of tracking a cursor.
// That's simpler and idempotent, and it's cheap because retention bounds the
// window. Today is left alone; only completed days are rolled.
export async function rollUpDailyMetrics(): Promise<number> {
  const todayStart = utcDayStart(new Date());
  const windowStart = new Date(todayStart.getTime() - env.metricsRetentionDays * MS_PER_DAY);

  // Grouping by a truncated date needs raw SQL, since Prisma's groupBy can't
  // date_trunc. The ::int casts stop Postgres returning bigints.
  const queryRows = await prisma.$queryRaw<QueryDayRow[]>`
    SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
           kind::text                                            AS kind,
           count(*)::int                                         AS count
    FROM query_logs
    WHERE "createdAt" >= ${windowStart} AND "createdAt" < ${todayStart}
    GROUP BY 1, 2
  `;

  const tokenRows = await prisma.$queryRaw<TokenDayRow[]>`
    SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
           operation::text                                       AS operation,
           sum("totalTokens")::int                               AS total,
           sum("promptTokens")::int                              AS prompt,
           sum("completionTokens")::int                          AS completion
    FROM token_usage
    WHERE "createdAt" >= ${windowStart} AND "createdAt" < ${todayStart}
    GROUP BY 1, 2
  `;

  const days = new Map<string, DayAggregate>();

  for (const row of queryRows) {
    const aggregate = days.get(row.day) ?? blankDay();
    if (row.kind === "SEARCH") aggregate.queriesSearch = row.count;
    else if (row.kind === "ASK") aggregate.queriesAsk = row.count;
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

// Everything deleted here is either already captured in daily_metrics or spent.
export async function pruneOldData(): Promise<void> {
  const now = new Date();
  const retentionCutoff = new Date(now.getTime() - env.metricsRetentionDays * MS_PER_DAY);

  const [queryLogs, tokenUsage] = await Promise.all([
    prisma.queryLog.deleteMany({ where: { createdAt: { lt: retentionCutoff } } }),
    prisma.tokenUsage.deleteMany({ where: { createdAt: { lt: retentionCutoff } } }),
  ]);

  await Promise.all([
    prisma.emailVerificationToken.deleteMany({
      where: { OR: [{ consumedAt: { not: null } }, { expiresAt: { lt: now } }] },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { OR: [{ consumedAt: { not: null } }, { expiresAt: { lt: now } }] },
    }),
    // Expired only, not revoked. Keeping revoked rows is what lets us spot a
    // replayed token later.
    prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);

  logger.info(
    `Pruned ${queryLogs.count} query log(s) and ${tokenUsage.count} token row(s) older than ${env.metricsRetentionDays}d.`,
  );
}

export async function runMetricsMaintenance(): Promise<void> {
  const rolledDays = await rollUpDailyMetrics();
  await pruneOldData();
  logger.info(`Metrics maintenance complete, rolled up ${rolledDays} day(s).`);
}
