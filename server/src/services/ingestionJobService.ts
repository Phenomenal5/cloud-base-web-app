import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import { parseAsrsCsv } from "../utils/asrsCsv.js";
import { ingestReports } from "./ingestionService.js";

// The worker's job handler. Kept separate from the queue wiring so it can be
// called directly and tested without pg-boss.
export async function processIngestionJob(jobId: string): Promise<void> {
  const job = await prisma.ingestionJob.findUnique({ where: { id: jobId } });
  if (!job) {
    logger.warn(`Ingestion job ${jobId} not found, skipping.`);
    return;
  }

  await prisma.ingestionJob.update({
    where: { id: jobId },
    data: { status: "PROCESSING", startedAt: new Date(), error: null },
  });

  try {
    const result = await ingestReports(parseAsrsCsv(job.sourceCsv));

    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        reportsIngested: result.reports,
        chunksCreated: result.chunks,
        completedAt: new Date(),
      },
    });
    logger.info(
      `Ingestion job ${jobId} complete: ${result.reports} report(s), ${result.chunks} chunk(s).`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: message, completedAt: new Date() },
    });
    logger.error(`Ingestion job ${jobId} failed: ${message}`);
    // Rethrow so pg-boss records the failure and retries with backoff.
    throw error;
  }
}
