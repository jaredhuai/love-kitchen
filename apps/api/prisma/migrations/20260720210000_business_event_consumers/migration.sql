ALTER TABLE "Notification"
  ADD COLUMN "sourceEventId" UUID,
  ADD COLUMN "sourceKey" TEXT;

ALTER TABLE "OutboxEvent" ADD COLUMN "dedupeKey" TEXT;

CREATE TABLE "ConsumerReceipt" (
  "id" UUID NOT NULL,
  "outboxEventId" UUID NOT NULL,
  "consumer" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_userId_type_sourceKey_key" ON "Notification"("userId", "type", "sourceKey");
CREATE INDEX "Notification_sourceEventId_idx" ON "Notification"("sourceEventId");
CREATE UNIQUE INDEX "OutboxEvent_dedupeKey_key" ON "OutboxEvent"("dedupeKey");
CREATE UNIQUE INDEX "ConsumerReceipt_outboxEventId_consumer_key" ON "ConsumerReceipt"("outboxEventId", "consumer");
CREATE INDEX "ConsumerReceipt_consumer_processedAt_idx" ON "ConsumerReceipt"("consumer", "processedAt");
