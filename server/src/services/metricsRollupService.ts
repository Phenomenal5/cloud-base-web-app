import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

// query_logs and token_usage grow forever, and the admin dashboard wants
// all-time totals off them. so the worker runs this nightly: squash each
// finished day into one daily_metrics row, then delete the raw rows past the
// retention window. dashboard then reads sum(daily_metrics) + today

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

// roll every finished day into daily_metrics
export async function rollUpDailyMetrics(): Promise<number> {
  // redo the whole retained window every night rather than keeping a cursor.
  // simpler, safe to run twice, and retention keeps it cheap. today is skipped,
  // it isn't finished yet
  const todayStart = utcDayStart(new Date());
  const windowStart = new Date(todayStart.getTime() - env.metricsRetentionDays * MS_PER_DAY);

  // raw SQL because prisma's groupBy can't date_trunc. the ::int casts stop
  // postgres handing back bigints that don't survive JSON
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

  // merge both result sets into one entry per day
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

  // upsert so re-running the same night just overwrites with the same numbers
  for (const [day, aggregate] of days) {
    await prisma.dailyMetric.upsert({
      where: { day },
      create: { day, ...aggregate },
      update: { ...aggregate },
    });
  }

  return days.size;
}

// bin the raw rows. safe because everything here is either already folded into
// daily_metrics or a token that's been spent
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
    // expired only, not merely revoked. keeping the revoked rows around is what
    // would let us spot a replayed token later
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
