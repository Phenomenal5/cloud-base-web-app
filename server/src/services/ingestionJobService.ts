import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import { parseAsrsCsv } from "../utils/asrsCsv.js";
import { ingestReports } from "./ingestionService.js";

// what the worker actually runs for a queued CSV. kept out of the queue wiring
// so it can be called straight from a script without pg-boss in the way
export async function processIngestionJob(jobId: string): Promise<void> {
  const job = await prisma.ingestionJob.findUnique({ where: { id: jobId } });

  // job row is gone, so there's nothing to do and nothing to fail
  if (!job) {
    logger.warn(`Ingestion job ${jobId} not found, skipping.`);
    return;
  }

  // mark it running so the admin page shows movement, and clear any old error
  // from a previous attempt
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
    // write the failure onto the job row so the admin can see why it died
    const message = error instanceof Error ? error.message : String(error);
    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: { status: "FAILED", error: message, completedAt: new Date() },
    });
    logger.error(`Ingestion job ${jobId} failed: ${message}`);

    // then rethrow, or pg-boss thinks it succeeded and never retries
    throw error;
  }
}
