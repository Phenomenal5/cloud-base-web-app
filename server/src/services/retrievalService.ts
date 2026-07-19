import { prisma } from "../config/prisma.js";
import { embedQuery, toVectorLiteral } from "./embeddingService.js";

// ─── Retrieval service ────────────────────────────────
//
// Semantic search: embed the query, find the nearest report chunks by cosine
// distance (pgvector `<=>`, backed by the HNSW index), then collapse to distinct
// reports keeping each report's best-matching chunk. Returns reports ranked by
// similarity — the retrieval half of RAG (grounded generation comes next).

export interface SearchHit {
  reportId: string;
  acn: string;
  synopsis: string | null;
  similarity: number; // 1 = identical direction, 0 = orthogonal (cosine)
  matchedChunk: string;
}

interface ChunkRow {
  reportId: string;
  content: string;
  similarity: number;
}

export async function semanticSearch(
  query: string,
  topReports = 5, // return the top N reports (FR-18)
  minSimilarity = 0,
): Promise<SearchHit[]> {
  const vector = await embedQuery(query);
  const literal = toVectorLiteral(vector);

  // Over-fetch chunks so we can collapse to `topReports` distinct reports even
  // when several top chunks belong to the same report.
  const chunkLimit = topReports * 4;

  const rows = await prisma.$queryRaw<ChunkRow[]>`
    SELECT c."reportId"                         AS "reportId",
           c.content                            AS content,
           1 - (c.embedding <=> ${literal}::vector) AS similarity
    FROM report_chunks c
    ORDER BY c.embedding <=> ${literal}::vector
    LIMIT ${chunkLimit}
  `;

  // Keep the best chunk per report, preserving similarity order.
  const bestByReport = new Map<string, ChunkRow>();
  for (const row of rows) {
    const current = bestByReport.get(row.reportId);
    if (!current || row.similarity > current.similarity) bestByReport.set(row.reportId, row);
  }

  const ranked = [...bestByReport.values()]
    .filter((row) => row.similarity >= minSimilarity) // drop weak matches (FR-24)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topReports);

  if (ranked.length === 0) return [];

  // Hydrate report metadata for the surviving reports.
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
