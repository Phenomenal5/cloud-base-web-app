import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import type { Role, QueryKind } from "../generated/prisma/enums.js";

// ─── Query log + quota service ────────────────────────
//
// The query_logs table is both the audit trail (FR-33) and the quota counter
// (FR-11/12): a day's usage is just the count of a user's / IP's rows since
// midnight UTC. No Redis (PRD §9.3) — Prisma is the source of truth.

// Daily limit for a role; null = unlimited (ADMIN). No role = guest.
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

// Queries used today by a member (userId) or a guest (ipAddress).
export function usedToday(identity: { userId?: string; ip?: string }): Promise<number> {
  return prisma.queryLog.count({
    where: {
      createdAt: { gte: startOfUtcDay() },
      ...(identity.userId ? { userId: identity.userId } : { ipAddress: identity.ip }),
    },
  });
}

// Record a completed query. IP is stored ONLY for guests (privacy, PRD §8.2).
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
