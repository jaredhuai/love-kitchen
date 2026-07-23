CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'DEAD');

ALTER TABLE "AuditLog" ADD COLUMN "outboxEventId" UUID;
CREATE UNIQUE INDEX "AuditLog_outboxEventId_key" ON "AuditLog"("outboxEventId");

CREATE TABLE "OutboxEvent" (
  "id" UUID NOT NULL,
  "kitchenId" UUID,
  "userId" UUID,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutboxEvent_status_availableAt_createdAt_idx" ON "OutboxEvent"("status", "availableAt", "createdAt");
CREATE INDEX "OutboxEvent_kitchenId_createdAt_idx" ON "OutboxEvent"("kitchenId", "createdAt");
