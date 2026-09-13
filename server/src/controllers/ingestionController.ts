import { prisma } from "../config/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { env } from "../config/env.js";
import { parseAsrsCsv } from "../utils/asrsCsv.js";
import { enqueueIngestion } from "../config/queue.js";

// what the admin UI gets back. note sourceCsv is not in here, the raw file never
// goes out over the wire
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

// ========== upload csv controller (admin) ==================
export const uploadIngestion = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError("Attach a CSV file in the 'file' field.", 400);

  // parse it up front so a broken CSV fails here instead of in the worker
  const csvText = req.file.buffer.toString("utf8");
  const records = parseAsrsCsv(csvText);
  if (records.length === 0) {
    throw new AppError("No valid reports found. The CSV needs ACN and narrative columns.", 400);
  }

  // cap the size. every row is a classification call plus an embedding call, so
  // an unbounded CSV is an unbounded bill and a job that runs for hours
  if (records.length > env.ingestionMaxRows) {
    throw new AppError(
      `This CSV has ${records.length} reports; the per-upload limit is ${env.ingestionMaxRows}. Please split it into smaller files.`,
      400,
    );
  }

  // save the job with the CSV attached, so the worker can pick it up later
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

  // hand it to the queue
  await enqueueIngestion(job.id);

  // 202 not 201, the work hasn't happened yet. the admin UI polls for the result
  res.status(202).json({
    message: `Queued ${records.length} report(s) for background ingestion.`,
    data: { job },
  });
});

// ========= list recent jobs controller ===============
export const listIngestions = catchAsync(async (_req, res) => {
  const jobs = await prisma.ingestionJob.findMany({
    orderBy: { createdAt: "desc" },
    take: RECENT_JOBS_LIMIT,
    select: JOB_SELECT,
  });
  res.status(200).json({ data: { jobs } });
});

// ========== single job status controller ============
export const getIngestion = catchAsync(async (req, res) => {
  // the admin ingestion page hits this on an interval while a job is running
  const job = await prisma.ingestionJob.findUnique({
    where: { id: req.params.id as string },
    select: JOB_SELECT,
  });
  if (!job) throw new AppError("Ingestion job not found.", 404);
  res.status(200).json({ data: { job } });
});
