import { prisma } from "../config/prisma.js";
import { embedQuery, toVectorLiteral } from "./embeddingService.js";

// Embed the question, find the nearest chunks by cosine distance (pgvector's
// `<=>`, served by the HNSW index), then collapse to distinct reports keeping
// each one's best chunk. This is the retrieval half of the RAG pipeline.

export interface SearchHit {
  reportId: string;
  acn: string;
  synopsis: string | null;
  similarity: number; // 1 is identical direction, 0 is orthogonal
  matchedChunk: string;
}

interface ChunkRow {
  reportId: string;
  content: string;
  similarity: number;
}

export async function semanticSearch(
  query: string,
  topReports = 5,
  minSimilarity = 0,
): Promise<SearchHit[]> {
  const literal = toVectorLiteral(await embedQuery(query));

  // Over-fetch, because several of the best chunks often belong to the same
  // report and we'd otherwise end up with fewer than topReports distinct ones.
  const chunkLimit = topReports * 4;

  const rows = await prisma.$queryRaw<ChunkRow[]>`
    SELECT c."reportId"                            AS "reportId",
           c.content                               AS content,
           1 - (c.embedding <=> ${literal}::vector) AS similarity
    FROM report_chunks c
    ORDER BY c.embedding <=> ${literal}::vector
    LIMIT ${chunkLimit}
  `;

  const bestByReport = new Map<string, ChunkRow>();
  for (const row of rows) {
    const current = bestByReport.get(row.reportId);
    if (!current || row.similarity > current.similarity) bestByReport.set(row.reportId, row);
  }

  const ranked = [...bestByReport.values()]
    .filter((row) => row.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topReports);

  if (ranked.length === 0) return [];

  const reports = await prisma.report.findMany({
    where: { id: { in: ranked.map((row) => row.reportId) } },
    select: { id: true, acn: true, synopsis: true },
  });
  const reportById = new Map(reports.map((report) => [report.id, report]));

  return ranked.map((row) => {
    const report = reportById.get(row.reportId);
    return {
      reportId: row.reportId,
      acn: report?.acn ?? "",
      synopsis: report?.synopsis ?? null,
      similarity: Number(row.similarity.toFixed(4)),
      matchedChunk: row.content,
    };
  });
}
