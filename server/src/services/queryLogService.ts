import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import type { Role, QueryKind } from "../generated/prisma/enums.js";

// query_logs does double duty: audit trail and quota counter. a day's usage is
// just a count of rows since midnight UTC. no redis in this stack, so postgres
// is the source of truth

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// how many questions a day this role gets. null means unlimited, and no role at
// all means they're a guest
export function dailyLimitFor(role: Role | undefined): number | null {
  if (!role) return env.quotaGuest;
  switch (role) {
    case "ADMIN":
      return null;
    case "ANALYST":
      return env.quotaAnalyst;
    default:
      return env.quotaTrainee;
  }
}

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// next midnight UTC. goes to the client so someone who's run out gets told when
// they get more, instead of just "limit reached"
export function quotaResetsAt(): Date {
  return new Date(startOfUtcDay().getTime() + MS_PER_DAY);
}

// count what they've spent today. signed-in users count by id, guests by IP
export function usedToday(identity: { userId?: string; ip?: string }): Promise<number> {
  return prisma.queryLog.count({
    where: {
      createdAt: { gte: startOfUtcDay() },
      ...(identity.userId ? { userId: identity.userId } : { ipAddress: identity.ip }),
    },
  });
}

export async function logQuery(entry: {
  userId?: string;
  ip?: string;
  kind: QueryKind;
  query: string;
  rewrittenQuery?: string;
  retrievalCount: number;
  citedReportIds: string[];
  latencyMs: number;
}): Promise<void> {
  await prisma.queryLog.create({
    data: {
      userId: entry.userId ?? null,
      // only store the IP for guests, they've got no user id to count against.
      // keeping it for signed-in users would be personal data we don't need
      ipAddress: entry.userId ? null : (entry.ip ?? null),
      kind: entry.kind,
      query: entry.query,
      rewrittenQuery: entry.rewrittenQuery ?? null,
      retrievalCount: entry.retrievalCount,
      citedReportIds: entry.citedReportIds,
      latencyMs: entry.latencyMs,
    },
  });
}
