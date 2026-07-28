-- AI 功能下线：保留普通菜品和安全日志，再永久删除 AI 会话及用量数据。
UPDATE "Dish" SET "sourceType" = 'MANUAL' WHERE "sourceType" = 'AI_GENERATED';
UPDATE "SecurityEvent" SET "type" = 'RATE_LIMITED' WHERE "type" = 'AI_ABUSE';

DROP TABLE IF EXISTS "AIMessage";
DROP TABLE IF EXISTS "AIConversation";
DROP TABLE IF EXISTS "AiUsageRecord";
DROP TYPE IF EXISTS "AiUsageStatus";

ALTER TYPE "DishSource" RENAME TO "DishSource_old";
CREATE TYPE "DishSource" AS ENUM ('MANUAL', 'IMPORTED');
ALTER TABLE "Dish"
  ALTER COLUMN "sourceType" DROP DEFAULT,
  ALTER COLUMN "sourceType" TYPE "DishSource" USING ("sourceType"::text::"DishSource"),
  ALTER COLUMN "sourceType" SET DEFAULT 'MANUAL';
DROP TYPE "DishSource_old";

ALTER TYPE "SecurityEventType" RENAME TO "SecurityEventType_old";
CREATE TYPE "SecurityEventType" AS ENUM (
  'LOGIN_FAILED',
  'TOKEN_REUSED',
  'INVITE_BRUTE_FORCE',
  'KITCHEN_ACCESS_DENIED',
  'UPLOAD_REJECTED',
  'RATE_LIMITED'
);
ALTER TABLE "SecurityEvent"
  ALTER COLUMN "type" TYPE "SecurityEventType" USING ("type"::text::"SecurityEventType");
DROP TYPE "SecurityEventType_old";
