-- ─── Scalability indexes + metrics rollup table ───────
-- Hand-authored (like the HNSW index migration) so the pg_trgm GIN index, which
-- Prisma's schema DSL can't express, ships in the same migration as the
-- Prisma-managed index/table changes.

-- Swap Conversation/Message single-column indexes for the composites that match
-- their actual list/order queries.
DROP INDEX "conversations_userId_idx";
DROP INDEX "messages_conversationId_idx";

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "conversations_userId_pinned_updatedAt_idx" ON "conversations"("userId", "pinned", "updatedAt");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "reports_reportDate_idx" ON "reports"("reportDate");

-- Trigram GIN for the conversation search (title/content ILIKE), a btree can't
-- accelerate `contains`. Not expressible in schema.prisma, so it's added here.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "messages_content_trgm_idx" ON "messages" USING gin ("content" gin_trgm_ops);

-- CreateTable
CREATE TABLE "daily_metrics" (
    "day" TEXT NOT NULL,
    "queriesSearch" INTEGER NOT NULL DEFAULT 0,
    "queriesAsk" INTEGER NOT NULL DEFAULT 0,
    "tokensTotal" INTEGER NOT NULL DEFAULT 0,
    "tokensPrompt" INTEGER NOT NULL DEFAULT 0,
    "tokensCompletion" INTEGER NOT NULL DEFAULT 0,
    "tokensByOperation" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_metrics_pkey" PRIMARY KEY ("day")
);
