import { prisma } from "../config/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { Role, QueryKind, JobStatus, AiOperation } from "../generated/prisma/enums.js";

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Turn sparse rows into a full { enumValue: count } map, so the dashboard always
// gets every key and doesn't have to handle missing ones.
function countsByKey<Key extends string>(
  keys: readonly Key[],
  rows: Array<{ key: Key; value: number }>,
): Record<Key, number> {
  const result = Object.fromEntries(keys.map((key) => [key, 0])) as Record<Key, number>;
  for (const row of rows) result[row.key] = row.value;
  return result;
}

// daily_metrics.tokensByOperation is a Json column we write ourselves, so it's
// always an object of numbers. This just narrows it back without trusting it.
function asNumberRecord(value: unknown): Record<string, number> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, number>;
  }
  return {};
}

// ─── GET /api/admin/metrics ───────────────────────────
//
// Query and token totals read as sum(daily_metrics) plus today's live rows. The
// worker folds each completed day into daily_metrics before pruning the raw
// tables, which keeps this query cheap no matter how much history accumulates.
export const getMetrics = catchAsync(async (_req, res) => {
  const todayStart = startOfUtcDay();

  const [
    userTotal,
    usersByRole,
    blockedUsers,
    usersToday,
    reportTotal,
    chunkTotal,
    jobsByStatus,
    jobTotals,
    recentSignups,
    dailyMetrics,
    queriesTodayByKind,
    tokensTodayTotals,
    tokensTodayByOperation,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.user.count({ where: { status: "BLOCKED" } }),
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.report.count(),
    prisma.reportChunk.count(),
    prisma.ingestionJob.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.ingestionJob.aggregate({
      _count: { _all: true },
      _sum: { reportsIngested: true, chunksCreated: true },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, displayName: true, email: true, role: true, createdAt: true },
    }),
    // One small row per completed day.
    prisma.dailyMetric.findMany(),
    // Today's rows, bounded to a single day.
    prisma.queryLog.groupBy({
      by: ["kind"],
      where: { createdAt: { gte: todayStart } },
      _count: { _all: true },
    }),
    prisma.tokenUsage.aggregate({
      where: { createdAt: { gte: todayStart } },
      _sum: { totalTokens: true, promptTokens: true, completionTokens: true },
    }),
    prisma.tokenUsage.groupBy({
      by: ["operation"],
      where: { createdAt: { gte: todayStart } },
      _sum: { totalTokens: true },
    }),
  ]);

  // ── Merge the rolled-up history with today ──
  let queriesSearch = 0;
  let queriesAsk = 0;
  let tokensTotal = 0;
  let tokensPrompt = 0;
  let tokensCompletion = 0;
  const tokensByOperation: Record<string, number> = {};

  for (const metric of dailyMetrics) {
    queriesSearch += metric.queriesSearch;
    queriesAsk += metric.queriesAsk;
    tokensTotal += metric.tokensTotal;
    tokensPrompt += metric.tokensPrompt;
    tokensCompletion += metric.tokensCompletion;
    for (const [operation, count] of Object.entries(asNumberRecord(metric.tokensByOperation))) {
      tokensByOperation[operation] = (tokensByOperation[operation] ?? 0) + count;
    }
  }

  for (const row of queriesTodayByKind) {
    if (row.kind === "SEARCH") queriesSearch += row._count._all;
    else if (row.kind === "ASK") queriesAsk += row._count._all;
  }

  tokensTotal += tokensTodayTotals._sum.totalTokens ?? 0;
  tokensPrompt += tokensTodayTotals._sum.promptTokens ?? 0;
  tokensCompletion += tokensTodayTotals._sum.completionTokens ?? 0;
  for (const row of tokensTodayByOperation) {
    tokensByOperation[row.operation] =
      (tokensByOperation[row.operation] ?? 0) + (row._sum.totalTokens ?? 0);
  }

  res.status(200).json({
    data: {
      users: {
        total: userTotal,
        blocked: blockedUsers,
        today: usersToday,
        byRole: countsByKey(
          Object.values(Role),
          usersByRole.map((row) => ({ key: row.role, value: row._count._all })),
        ),
      },
      corpus: { reports: reportTotal, chunks: chunkTotal },
      jobs: {
        total: jobTotals._count._all,
        reportsIngested: jobTotals._sum.reportsIngested ?? 0,
        chunksCreated: jobTotals._sum.chunksCreated ?? 0,
        byStatus: countsByKey(
          Object.values(JobStatus),
          jobsByStatus.map((row) => ({ key: row.status, value: row._count._all })),
        ),
      },
      queries: {
        total: queriesSearch + queriesAsk,
        byKind: countsByKey(Object.values(QueryKind), [
          { key: QueryKind.SEARCH, value: queriesSearch },
          { key: QueryKind.ASK, value: queriesAsk },
        ]),
      },
      tokens: {
        total: tokensTotal,
        prompt: tokensPrompt,
        completion: tokensCompletion,
        byOperation: countsByKey(
          Object.values(AiOperation),
          Object.entries(tokensByOperation).map(([key, value]) => ({
            key: key as AiOperation,
            value,
          })),
        ),
      },
      recentSignups,
    },
  });
});
