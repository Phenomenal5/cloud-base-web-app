import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import { chunkText } from "../utils/chunk.js";
import { embedTexts, toVectorLiteral } from "./embeddingService.js";
import { classifyReport } from "./classificationService.js";

// Report -> chunks -> embeddings -> Postgres/pgvector. Shared by the seed script
// and the background worker. Idempotent by ACN: re-ingesting a report replaces
// its chunks instead of duplicating them.

export interface RawReport {
  acn: string;
  narrative: string;
  synopsis?: string | null;
  reportDate?: Date | null;
}

export interface IngestResult {
  reports: number;
  chunks: number;
  skipped: number;
}

// The typed client can't write the embedding column (it's Unsupported()), so
// chunks go in through raw SQL. NOTE: built as one multi-row INSERT rather than
// one statement per chunk. A single large report can produce dozens of chunks,
// and a round trip each is what makes a big ingestion crawl. Values are still
// parameterized, not interpolated.
async function insertChunks(reportId: string, pieces: string[], vectors: number[][]) {
  const rows = pieces.map(
    (content, index) =>
      Prisma.sql`(${randomUUID()}, ${reportId}, ${index}, ${content}, ${toVectorLiteral(vectors[index]!)}::vector, now())`,
  );

  await prisma.$executeRaw`
    INSERT INTO report_chunks (id, "reportId", "chunkIndex", content, embedding, "createdAt")
    VALUES ${Prisma.join(rows)}
  `;
}

export async function ingestReports(records: RawReport[]): Promise<IngestResult> {
  let reports = 0;
  let chunks = 0;
  let skipped = 0;

  for (const record of records) {
    if (!record.acn?.trim() || !record.narrative?.trim()) {
      skipped++;
      continue;
    }

    const pieces = chunkText(record.narrative);
    if (pieces.length === 0) {
      skipped++;
      continue;
    }

    // Classify at ingestion time so the triage view has category and severity
    // ready without another LLM call on read.
    const classification = await classifyReport(record.narrative);
    const vectors = await embedTexts(pieces);

    const fields = {
      narrative: record.narrative,
      synopsis: record.synopsis ?? null,
      reportDate: record.reportDate ?? null,
      category: classification.category,
      severity: classification.severity,
      severityJustification: classification.justification,
    };

    const report = await prisma.report.upsert({
      where: { acn: record.acn },
      // The narrative may have changed, so any cached summary is now stale.
      update: { ...fields, summary: null },
      create: { acn: record.acn, ...fields },
    });

    await prisma.reportChunk.deleteMany({ where: { reportId: report.id } });
    await insertChunks(report.id, pieces, vectors);

    reports++;
    chunks += pieces.length;
    logger.info(`Ingested ${record.acn}, ${pieces.length} chunk(s)`);
  }

  return { reports, chunks, skipped };
}
