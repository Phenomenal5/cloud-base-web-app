import { prisma } from "../config/prisma.js";
import { embedQuery, toVectorLiteral } from "./embeddingService.js";

// the retrieval half of the RAG pipeline

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
  // embed the question the same way the chunks were embedded
  const literal = toVectorLiteral(await embedQuery(query));

  // grab more than we need. several of the best chunks usually come from the
  // same report, so asking for exactly topReports leaves us short after dedupe
  const chunkLimit = topReports * 4;

  const rows = await prisma.$queryRaw<ChunkRow[]>`
    SELECT c."reportId"                            AS "reportId",
           c.content                               AS content,
           1 - (c.embedding <=> ${literal}::vector) AS similarity
    FROM report_chunks c
    ORDER BY c.embedding <=> ${literal}::vector
    LIMIT ${chunkLimit}
  `;

  // one entry per report, keeping whichever chunk scored highest
  const bestByReport = new Map<string, ChunkRow>();
  for (const row of rows) {
    const current = bestByReport.get(row.reportId);
    if (!current || row.similarity > current.similarity) bestByReport.set(row.reportId, row);
  }

  // drop anything too weak, sort best first, then cut to the number asked for
  const ranked = [...bestByReport.values()]
    .filter((row) => row.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topReports);

  if (ranked.length === 0) return [];

  // now go get the ACN and synopsis for the winners
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
