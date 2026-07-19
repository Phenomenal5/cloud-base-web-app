-- CreateEnum
CREATE TYPE "AiOperation" AS ENUM ('EMBEDDING', 'CHAT', 'REWRITE', 'CLASSIFICATION', 'SUMMARIZATION');

-- CreateTable
CREATE TABLE "token_usage" (
    "id" TEXT NOT NULL,
    "operation" "AiOperation" NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "token_usage_operation_createdAt_idx" ON "token_usage"("operation", "createdAt");
