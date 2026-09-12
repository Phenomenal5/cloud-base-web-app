-- Enable pgvector (no-op if already present). MUST run before the vector column.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "acn" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "synopsis" TEXT,
    "reportDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_chunks" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reports_acn_key" ON "reports"("acn");

-- CreateIndex
CREATE INDEX "report_chunks_reportId_idx" ON "report_chunks"("reportId");

-- AddForeignKey
ALTER TABLE "report_chunks" ADD CONSTRAINT "report_chunks_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- HNSW index for fast approximate nearest-neighbour search over embeddings,
-- using cosine distance (operator <=>). Prisma can't express this, hand-added.
CREATE INDEX "report_chunks_embedding_hnsw_idx" ON "report_chunks" USING hnsw (embedding vector_cosine_ops);
