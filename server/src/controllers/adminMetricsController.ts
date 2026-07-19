import { prisma } from "../config/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { Role, QueryKind, JobStatus, AiOperation } from "../generated/prisma/enums.js";

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Build a { key: number } object with every enum value present (default 0).
function tallocate<Key extends string>(
  keys: readonly Key[],
  rows: Array<{ key: Key; value: number }>,
): Record<Key, number> {
  const result = Object.fromEntries(keys.map((key) => [key, 0])) as Record<Key, number>;
  for (const row of rows) result[row.key] = row.value;
  return result;
}

// Coerce a Prisma Json column we control (always an object of numbers) back to a
// typed map, tolerating any unexpected shape.
function asNumberRecord(value: unknown): Record<string, number> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, number>;
  }
  return {};
}

// ─── GET /api/admin/metrics ───────────────────────────
// Dashboard aggregates. ADMIN only (enforced by the route).
//
// Query and token totals are read as: sum(daily_metrics) [history rolled up by
// the worker] + today's live rows. This keeps the read cheap and bounded even
// after the raw query_logs / token_usage rows are pruned by retention — the
// worker rolls each completed day into daily_metrics before pruning it.
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
    // Rolled-up history (one small row per completed day).
    prisma.dailyMetric.findMany(),
    // Today's live rows (small — bounded to a single day).
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

  // ── Merge rollup history + today's live counts ──
  let queriesSearch = 0;
  let queriesAsk = 0;
  const tokenByOperation: Record<string, number> = {};
  let tokensTotal = 0;
  let tokensPrompt = 0;
  let tokensCompletion = 0;

  for (const metric of dailyMetrics) {
    queriesSearch += metric.queriesSearch;
    queriesAsk += metric.queriesAsk;
    tokensTotal += metric.tokensTotal;
    tokensPrompt += metric.tokensPrompt;
    tokensCompletion += metric.tokensCompletion;
    for (const [operation, count] of Object.entries(asNumberRecord(metric.tokensByOperation))) {
      tokenByOperation[operation] = (tokenByOperation[operation] ?? 0) + count;
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
    tokenByOperation[row.operation] =
      (tokenByOperation[row.operation] ?? 0) + (row._sum.totalTokens ?? 0);
  }

  res.status(200).json({
    data: {
      users: {
        total: userTotal,
        blocked: blockedUsers,
        today: usersToday,
        byRole: tallocate(
          Object.values(Role),
          usersByRole.map((row) => ({ key: row.role, value: row._count._all })),
        ),
      },
      corpus: { reports: reportTotal, chunks: chunkTotal },
      jobs: {
        total: jobTotals._count._all,
        reportsIngested: jobTotals._sum.reportsIngested ?? 0,
        chunksCreated: jobTotals._sum.chunksCreated ?? 0,
        byStatus: tallocate(
          Object.values(JobStatus),
          jobsByStatus.map((row) => ({ key: row.status, value: row._count._all })),
        ),
      },
      queries: {
        total: queriesSearch + queriesAsk,
        byKind: tallocate(Object.values(QueryKind), [
          { key: QueryKind.SEARCH, value: queriesSearch },
          { key: QueryKind.ASK, value: queriesAsk },
        ]),
      },
      tokens: {
        total: tokensTotal,
        prompt: tokensPrompt,
        completion: tokensCompletion,
        byOperation: tallocate(
          Object.values(AiOperation),
          Object.entries(tokenByOperation).map(([key, value]) => ({
            key: key as AiOperation,
            value,
          })),
        ),
      },
      recentSignups,
    },
  });
});
