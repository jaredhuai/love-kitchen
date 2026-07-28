CREATE TYPE "DishCategory" AS ENUM (
  'MEAT',
  'VEGETABLE',
  'SOUP_PORRIDGE',
  'DESSERT_SNACK',
  'WESTERN',
  'SEAFOOD',
  'DRINK',
  'STAPLE',
  'OTHER'
);

CREATE TYPE "DishKind" AS ENUM ('PERMANENT', 'TEMPORARY');

ALTER TABLE "Dish"
  ADD COLUMN "notes" VARCHAR(2000),
  ADD COLUMN "kind" "DishKind" NOT NULL DEFAULT 'PERMANENT',
  ADD COLUMN "effectiveDate" DATE;

ALTER TABLE "Dish" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "Dish"
  ALTER COLUMN "category" TYPE "DishCategory"
  USING (
    CASE
      WHEN "category" = '荤菜' THEN 'MEAT'
      WHEN "category" = '素菜' THEN 'VEGETABLE'
      WHEN "category" IN ('汤羹', '粥', '汤羹粥') THEN 'SOUP_PORRIDGE'
      WHEN "category" IN ('甜品', '零食', '烘焙', '小吃', '甜品零食') THEN 'DESSERT_SNACK'
      WHEN "category" = '西餐' THEN 'WESTERN'
      WHEN "category" = '海鲜' THEN 'SEAFOOD'
      WHEN "category" = '饮品' THEN 'DRINK'
      WHEN "category" = '主食' THEN 'STAPLE'
      ELSE 'OTHER'
    END
  )::"DishCategory";
UPDATE "Dish" SET "category" = 'OTHER' WHERE "category" IS NULL;
ALTER TABLE "Dish"
  ALTER COLUMN "category" SET DEFAULT 'OTHER',
  ALTER COLUMN "category" SET NOT NULL;

CREATE TABLE "DishImage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kitchenId" UUID NOT NULL,
  "dishId" UUID NOT NULL,
  "uploadId" UUID NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "isCover" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DishImage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DishImage_dishId_fkey"
    FOREIGN KEY ("dishId") REFERENCES "Dish"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DishImage_dishId_sortOrder_key" ON "DishImage"("dishId", "sortOrder");
CREATE UNIQUE INDEX "DishImage_dishId_uploadId_key" ON "DishImage"("dishId", "uploadId");
CREATE INDEX "DishImage_kitchenId_uploadId_idx" ON "DishImage"("kitchenId", "uploadId");
CREATE INDEX "Dish_kitchenId_kind_category_idx" ON "Dish"("kitchenId", "kind", "category");

INSERT INTO "DishImage" ("kitchenId", "dishId", "uploadId", "sortOrder", "isCover")
SELECT d."kitchenId", d."id", d."coverImageUrl"::uuid, 0, true
FROM "Dish" d
JOIN "UploadFile" u
  ON u."id"::text = d."coverImageUrl"
 AND u."kitchenId" = d."kitchenId"
WHERE d."coverImageUrl" IS NOT NULL
  AND d."coverImageUrl" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
ON CONFLICT DO NOTHING;

ALTER TABLE "MealLog" ADD COLUMN "dishSnapshot" JSONB;
