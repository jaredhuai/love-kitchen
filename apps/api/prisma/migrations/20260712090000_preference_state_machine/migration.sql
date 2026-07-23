-- CreateEnum
CREATE TYPE "MealPreferenceSessionState" AS ENUM ('OPEN', 'READY_TO_REVEAL', 'REVEALED', 'CLOSED');

-- AlterTable
ALTER TABLE "MealPreferenceSession"
ADD COLUMN "state" "MealPreferenceSessionState" NOT NULL DEFAULT 'OPEN',
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "closedAt" TIMESTAMP(3);

-- Preserve the meaning of existing revealed sessions and submissions.
UPDATE "MealPreferenceSession"
SET "state" = 'REVEALED'
WHERE "revealedAt" IS NOT NULL;

UPDATE "MealPreferenceSession" AS session
SET "state" = 'READY_TO_REVEAL'
WHERE session."revealedAt" IS NULL
  AND (
    SELECT COUNT(DISTINCT submission."userId")
    FROM "MealPreferenceSubmission" AS submission
    WHERE submission."sessionId" = session."id"
  ) >= 2;

-- CreateIndex
CREATE INDEX "MealPreferenceSession_kitchenId_state_mealDate_idx"
ON "MealPreferenceSession"("kitchenId", "state", "mealDate");
