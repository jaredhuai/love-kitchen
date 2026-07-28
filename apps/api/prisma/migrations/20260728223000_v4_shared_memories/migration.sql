ALTER TABLE "Dish" ADD COLUMN "story" VARCHAR(3000);

CREATE TABLE "StoryComment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kitchenId" UUID NOT NULL,
  "storyId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "content" VARCHAR(1000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "StoryComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoryComment_storyId_fkey"
    FOREIGN KEY ("storyId") REFERENCES "KitchenStory"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "StoryComment_storyId_deletedAt_createdAt_idx"
  ON "StoryComment"("storyId", "deletedAt", "createdAt");

CREATE INDEX "StoryComment_kitchenId_userId_idx"
  ON "StoryComment"("kitchenId", "userId");
