import { prisma } from "../config/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { summarizeReport } from "../services/summarizationService.js";
import { CATEGORIES, SEVERITIES } from "../services/classificationService.js";
import type { Category, Severity } from "../generated/prisma/enums.js";

// Everything except the raw embedding.
const REPORT_SELECT = {
  id: true,
  acn: true,
  synopsis: true,
  narrative: true,
  reportDate: true,
  category: true,
  severity: true,
  severityJustification: true,
  summary: true,
  createdAt: true,
} as const;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// ─── GET /api/reports/:id ─────────────────────────────
// Any signed-in user. The plain-language summary is generated on first view and
// cached on the row, so the LLM is never asked for the same one twice.
export const getReport = catchAsync(async (req, res) => {
  const id = req.params.id as string;
  const report = await prisma.report.findUnique({ where: { id }, select: REPORT_SELECT });
  if (!report) throw new AppError("Report not found.", 404);

  let { summary } = report;
  if (!summary) {
    summary = await summarizeReport(report.narrative);
    await prisma.report.update({ where: { id }, data: { summary } });
  }

  res.status(200).json({ data: { report: { ...report, summary } } });
});

// ─── GET /api/reports (analyst triage) ────────────────
// ANALYST and ADMIN only, enforced on the route.
export const listReports = catchAsync(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  // Only apply filters that are actually valid, so a bad param narrows nothing
  // rather than erroring.
  const categoryParam = req.query.category as string | undefined;
  const severityParam = req.query.severity as string | undefined;
  const category = CATEGORIES.includes(categoryParam as Category)
    ? (categoryParam as Category)
    : undefined;
  const severity = SEVERITIES.includes(severityParam as Severity)
    ? (severityParam as Severity)
    : undefined;

  const from = req.query.from ? new Date(req.query.from as string) : undefined;
  const to = req.query.to ? new Date(req.query.to as string) : undefined;
  const reportDate: Record<string, Date> = {};
  if (from && !Number.isNaN(from.getTime())) reportDate.gte = from;
  if (to && !Number.isNaN(to.getTime())) reportDate.lte = to;

  const where = {
    ...(category ? { category } : {}),
    ...(severity ? { severity } : {}),
    ...(Object.keys(reportDate).length ? { reportDate } : {}),
  };

  const [reports, total] = await prisma.$transaction([
    prisma.report.findMany({
      where,
      orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
      select: {
        id: true,
        acn: true,
        synopsis: true,
        reportDate: true,
        category: true,
        severity: true,
      },
    }),
    prisma.report.count({ where }),
  ]);

  res.status(200).json({
    data: { reports, page, limit, total, pages: Math.ceil(total / limit) },
  });
});
