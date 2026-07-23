CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DELETION_PENDING', 'DEACTIVATED');
CREATE TYPE "DataExportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED');
CREATE TYPE "AccountDeletionJobStatus" AS ENUM ('COOLING_OFF', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'FAILED', 'RESTORED');

ALTER TABLE "User"
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "deactivatedAt" TIMESTAMP(3);

CREATE TABLE "DataExportJob" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "requestKey" TEXT NOT NULL,
  "status" "DataExportJobStatus" NOT NULL DEFAULT 'PENDING',
  "result" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataExportJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataExportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AccountDeletionJob" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "requestKey" TEXT NOT NULL,
  "status" "AccountDeletionJobStatus" NOT NULL DEFAULT 'COOLING_OFF',
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "recoveryTokenHash" TEXT NOT NULL,
  "dryRun" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "restoredAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountDeletionJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountDeletionJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DataExportJob_userId_requestKey_key" ON "DataExportJob"("userId", "requestKey");
CREATE INDEX "DataExportJob_status_createdAt_idx" ON "DataExportJob"("status", "createdAt");
CREATE INDEX "DataExportJob_expiresAt_idx" ON "DataExportJob"("expiresAt");
CREATE UNIQUE INDEX "AccountDeletionJob_userId_requestKey_key" ON "AccountDeletionJob"("userId", "requestKey");
CREATE INDEX "AccountDeletionJob_userId_status_idx" ON "AccountDeletionJob"("userId", "status");
CREATE INDEX "AccountDeletionJob_status_scheduledFor_idx" ON "AccountDeletionJob"("status", "scheduledFor");
