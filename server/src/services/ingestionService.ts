import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import { chunkText } from "../utils/chunk.js";
import { embedTexts, toVectorLiteral } from "./embeddingService.js";
import { classifyReport } from "./classificationService.js";

// report -> chunks -> embeddings -> postgres. used by both the seed script and
// the worker. keyed on ACN, so re-ingesting the same report replaces its chunks
// rather than doubling them up

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

// write chunks + vectors straight to SQL, the typed client can't touch the
// embedding column because it's Unsupported()
async function insertChunks(reportId: string, pieces: string[], vectors: number[][]) {
  // one multi-row INSERT instead of one per chunk. a big report makes dozens and
  // a round trip each is what made ingestion crawl. still parameterised

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
    // no ACN or no narrative means there's nothing worth storing
    if (!record.acn?.trim() || !record.narrative?.trim()) {
      skipped++;
      continue;
    }

    // split the narrative into overlapping windows
    const pieces = chunkText(record.narrative);
    if (pieces.length === 0) {
      skipped++;
      continue;
    }

    // classify now, at ingest, so the triage page doesn't need an LLM call just
    // to show a category
    const classification = await classifyReport(record.narrative);

    // embed every chunk in one request
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
      // null the summary on update, the narrative may have changed so whatever
      // we cached is now describing the old text
      update: { ...fields, summary: null },
      create: { acn: record.acn, ...fields },
    });

    // clear the old chunks before writing the new ones, otherwise a re-ingest
    // leaves both sets in there and search returns duplicates
    await prisma.reportChunk.deleteMany({ where: { reportId: report.id } });
    await insertChunks(report.id, pieces, vectors);

    reports++;
    chunks += pieces.length;
    logger.info(`Ingested ${record.acn}, ${pieces.length} chunk(s)`);
  }

  return { reports, chunks, skipped };
}
