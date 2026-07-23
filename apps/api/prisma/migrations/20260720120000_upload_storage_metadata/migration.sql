CREATE TYPE "UploadStorageDriver" AS ENUM ('LOCAL', 'COS');
CREATE TYPE "UploadFileStatus" AS ENUM ('ACTIVE', 'DELETED', 'ORPHANED');

ALTER TABLE "UploadFile"
  ADD COLUMN "storageDriver" "UploadStorageDriver" NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN "checksum" TEXT,
  ADD COLUMN "status" "UploadFileStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "thumbnailKey" TEXT;

CREATE UNIQUE INDEX "UploadFile_thumbnailKey_key" ON "UploadFile"("thumbnailKey");
CREATE INDEX "UploadFile_status_createdAt_idx" ON "UploadFile"("status", "createdAt");
ALTER TABLE "UploadFile" ADD CONSTRAINT "UploadFile_checksum_format_check" CHECK ("checksum" IS NULL OR "checksum" ~ '^[0-9a-f]{64}$');
