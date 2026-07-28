import { prisma } from "../config/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { env } from "../config/env.js";
import { parseAsrsCsv } from "../utils/asrsCsv.js";
import { enqueueIngestion } from "../config/queue.js";

// What the admin UI sees. Never the raw CSV.
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

const RECENT_JOBS_LIMIT = 50;

// ─── POST /api/admin/ingestions ───────────────────────
// Records a QUEUED job and hands it to the worker. Returns 202 immediately, so
// the request never blocks on ingestion.
export const uploadIngestion = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError("Attach a CSV file in the 'file' field.", 400);

  const csvText = req.file.buffer.toString("utf8");
  const records = parseAsrsCsv(csvText);
  if (records.length === 0) {
    throw new AppError("No valid reports found. The CSV needs ACN and narrative columns.", 400);
  }
  // Every row means a classification call and an embedding call, so an unbounded
  // CSV is uncontrolled spend and a worker job that runs for hours.
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
    take: RECENT_JOBS_LIMIT,
    select: JOB_SELECT,
  });
  res.status(200).json({ data: { jobs } });
});

// ─── GET /api/admin/ingestions/:id ────────────────────
// The admin UI polls this for live status.
export const getIngestion = catchAsync(async (req, res) => {
  const job = await prisma.ingestionJob.findUnique({
    where: { id: req.params.id as string },
    select: JOB_SELECT,
  });
  if (!job) throw new AppError("Ingestion job not found.", 404);
  res.status(200).json({ data: { job } });
});
