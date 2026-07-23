CREATE TYPE "AiUsageStatus" AS ENUM ('IN_PROGRESS', 'SUCCEEDED', 'DEGRADED', 'FAILED');

CREATE TABLE "AiUsageRecord" (
  "id" UUID NOT NULL,
  "kitchenId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "requestKey" TEXT NOT NULL,
  "status" "AiUsageStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "provider" TEXT NOT NULL,
  "model" TEXT,
  "estimatedInputTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedOutputTokens" INTEGER NOT NULL DEFAULT 0,
  "costMicros" INTEGER NOT NULL DEFAULT 0,
  "latencyMs" INTEGER,
  "response" JSONB,
  "errorCode" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiUsageRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiUsageRecord_userId_kitchenId_requestKey_key" ON "AiUsageRecord"("userId", "kitchenId", "requestKey");
CREATE INDEX "AiUsageRecord_userId_createdAt_status_idx" ON "AiUsageRecord"("userId", "createdAt", "status");
CREATE INDEX "AiUsageRecord_kitchenId_createdAt_status_idx" ON "AiUsageRecord"("kitchenId", "createdAt", "status");
CREATE INDEX "AiUsageRecord_expiresAt_idx" ON "AiUsageRecord"("expiresAt");
