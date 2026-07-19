import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import { chunkText } from "../utils/chunk.js";
import { embedTexts, toVectorLiteral } from "./embeddingService.js";
import { classifyReport } from "./classificationService.js";

// ─── Ingestion service ────────────────────────────────
//
// Report → chunks → embeddings → Postgres/pgvector. Shared by the offline seed
// script now and (later) the admin-triggered background worker. Idempotent by
// ACN: re-ingesting the same report replaces its chunks rather than duplicating.

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

export async function ingestReports(records: RawReport[]): Promise<IngestResult> {
  let reports = 0;
  let chunks = 0;
  let skipped = 0;

  for (const record of records) {
    if (!record.acn?.trim() || !record.narrative?.trim()) {
      skipped++;
      continue;
    }

    // Classify (category + severity) at ingestion so triage data is ready (FR-20/21).
    const classification = await classifyReport(record.narrative);

    // Upsert the report (idempotent by ACN). On update, null the cached summary —
    // the narrative may have changed, so any prior summary is stale.
    const report = await prisma.report.upsert({
      where: { acn: record.acn },
      update: {
        narrative: record.narrative,
        synopsis: record.synopsis ?? null,
        reportDate: record.reportDate ?? null,
        category: classification.category,
        severity: classification.severity,
        severityJustification: classification.justification,
        summary: null,
      },
      create: {
        acn: record.acn,
        narrative: record.narrative,
        synopsis: record.synopsis ?? null,
        reportDate: record.reportDate ?? null,
        category: classification.category,
        severity: classification.severity,
        severityJustification: classification.justification,
      },
    });

    // Replace existing chunks so re-ingestion stays clean.
    await prisma.reportChunk.deleteMany({ where: { reportId: report.id } });

    const pieces = chunkText(record.narrative);
    if (pieces.length === 0) {
      skipped++;
      continue;
    }

    const vectors = await embedTexts(pieces);

    // Insert chunks via raw SQL — the embedding is an Unsupported() vector column
    // the typed client can't write. Parameterized; the literal is cast to vector.
    for (let index = 0; index < pieces.length; index++) {
      await prisma.$executeRaw`
        INSERT INTO report_chunks (id, "reportId", "chunkIndex", content, embedding, "createdAt")
        VALUES (${randomUUID()}, ${report.id}, ${index}, ${pieces[index]}, ${toVectorLiteral(vectors[index]!)}::vector, now())
      `;
      chunks++;
    }

    reports++;
    logger.info(`Ingested ${record.acn} — ${pieces.length} chunk(s)`);
  }

  return { reports, chunks, skipped };
}
