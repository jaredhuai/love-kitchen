CREATE TABLE "IdempotencyKey" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "operation" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "response" JSONB,
  "statusCode" INTEGER,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IdempotencyKey_userId_operation_key_key" ON "IdempotencyKey"("userId", "operation", "key");
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");
