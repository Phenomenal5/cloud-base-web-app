import { prisma } from "../config/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { summarizeReport } from "../services/summarizationService.js";
import { CATEGORIES, SEVERITIES } from "../services/classificationService.js";
import type { Category, Severity } from "../generated/prisma/enums.js";

// everything on the row except the embedding, which is a 1536-float vector
// nobody in the UI has any use for
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

// ========== single report controller ==================
export const getReport = catchAsync(async (req, res) => {
  const id = req.params.id as string;
  const report = await prisma.report.findUnique({ where: { id }, select: REPORT_SELECT });
  if (!report) throw new AppError("Report not found.", 404);

  // the plain-language summary is made on first view then cached on the row, so
  // we never pay the LLM twice for the same report
  let { summary } = report;
  if (!summary) {
    summary = await summarizeReport(report.narrative);
    await prisma.report.update({ where: { id }, data: { summary } });
  }

  res.status(200).json({ data: { report: { ...report, summary } } });
});

// ========= report triage list controller (analyst + admin) ===============
export const listReports = catchAsync(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  // only take category and severity if they're real enum values. a junk param
  // then just filters nothing instead of blowing up
  const categoryParam = req.query.category as string | undefined;
  const severityParam = req.query.severity as string | undefined;
  const category = CATEGORIES.includes(categoryParam as Category)
    ? (categoryParam as Category)
    : undefined;
  const severity = SEVERITIES.includes(severityParam as Severity)
    ? (severityParam as Severity)
    : undefined;

  // same idea for the date range, an unparseable date is dropped
  const from = req.query.from ? new Date(req.query.from as string) : undefined;
  const to = req.query.to ? new Date(req.query.to as string) : undefined;
  const reportDate: Record<string, Date> = {};
  if (from && !Number.isNaN(from.getTime())) reportDate.gte = from;
  if (to && !Number.isNaN(to.getTime())) reportDate.lte = to;

  // whatever survived goes into the filter
  const where = {
    ...(category ? { category } : {}),
    ...(severity ? { severity } : {}),
    ...(Object.keys(reportDate).length ? { reportDate } : {}),
  };

  // rows and count together so the page total matches the rows we just sent
  const [reports, total] = await prisma.$transaction([
    prisma.report.findMany({
      where,
      // newest incident first, createdAt breaks ties on reports filed the same day
      orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
      // the list only needs enough for a row, the full narrative comes from getReport
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
