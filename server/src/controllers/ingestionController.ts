import { prisma } from "../config/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { env } from "../config/env.js";
import { parseAsrsCsv } from "../utils/asrsCsv.js";
import { enqueueIngestion } from "../config/queue.js";

// Job fields surfaced to the admin UI (never the raw CSV).
const JOB_SELECT = {
  id: true,
  filename: true,
  status: true,
  totalRows: true,
  reportsIngested: true,
  chunksCreated: true,
  error: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
} as const;

// ─── POST /api/admin/ingestions ───────────────────────
// Accepts a CSV (multipart field "file"), records a QUEUED job, and enqueues it
// for the background worker. Returns 202 — the request never blocks on ingestion
// (FR-14/29/30).
export const uploadIngestion = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError("Attach a CSV file in the 'file' field.", 400);

  const csvText = req.file.buffer.toString("utf8");
  const records = parseAsrsCsv(csvText);
  if (records.length === 0) {
    throw new AppError("No valid reports found — the CSV needs ACN and narrative columns.", 400);
  }
  // Cap rows per upload — each row drives classification + embedding LLM calls,
  // so an unbounded CSV is uncontrolled spend and an hours-long worker job.
  if (records.length > env.ingestionMaxRows) {
    throw new AppError(
      `This CSV has ${records.length} reports; the per-upload limit is ${env.ingestionMaxRows}. Please split it into smaller files.`,
      400,
    );
  }

  const job = await prisma.ingestionJob.create({
    data: {
      uploaderId: req.user!.id,
      filename: req.file.originalname,
      totalRows: records.length,
      sourceCsv: csvText,
      status: "QUEUED",
    },
    select: JOB_SELECT,
  });

  await enqueueIngestion(job.id);

  res.status(202).json({
    message: `Queued ${records.length} report(s) for background ingestion.`,
    data: { job },
  });
});

// ─── GET /api/admin/ingestions ────────────────────────
export const listIngestions = catchAsync(async (_req, res) => {
  const jobs = await prisma.ingestionJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: JOB_SELECT,
  });
  res.status(200).json({ data: { jobs } });
});

// ─── GET /api/admin/ingestions/:id ────────────────────
// Poll this for live status (queued / processing / completed / failed) (FR-31).
export const getIngestion = catchAsync(async (req, res) => {
  const job = await prisma.ingestionJob.findUnique({
    where: { id: req.params.id as string },
    select: JOB_SELECT,
  });
  if (!job) throw new AppError("Ingestion job not found.", 404);
  res.status(200).json({ data: { job } });
});
