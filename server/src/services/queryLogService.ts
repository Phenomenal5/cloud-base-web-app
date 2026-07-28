import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import type { Role, QueryKind } from "../generated/prisma/enums.js";

// query_logs is both the audit trail and the quota counter: a day's usage is
// just the count of a user's or an IP's rows since midnight UTC. No Redis in
// this stack, so Postgres is the source of truth.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// null means unlimited. No role at all means a guest.
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

// Next midnight UTC. Sent to the client so someone who's out of questions is told
// when they get them back, rather than just "limit reached".
export function quotaResetsAt(): Date {
  return new Date(startOfUtcDay().getTime() + MS_PER_DAY);
}

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
      // The IP is only kept for guests, who have no user id to count against.
      // Storing it for signed-in users would be personal data we don't need.
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
