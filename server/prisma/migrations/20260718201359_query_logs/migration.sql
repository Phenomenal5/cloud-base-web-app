-- CreateEnum
CREATE TYPE "QueryKind" AS ENUM ('SEARCH', 'ASK');

-- CreateTable
CREATE TABLE "query_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "ipAddress" TEXT,
    "kind" "QueryKind" NOT NULL,
    "query" TEXT NOT NULL,
    "rewrittenQuery" TEXT,
    "retrievalCount" INTEGER NOT NULL DEFAULT 0,
    "citedReportIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "query_logs_userId_createdAt_idx" ON "query_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "query_logs_ipAddress_createdAt_idx" ON "query_logs"("ipAddress", "createdAt");

-- AddForeignKey
ALTER TABLE "query_logs" ADD CONSTRAINT "query_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
