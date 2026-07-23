-- CreateEnum
CREATE TYPE "KitchenRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'LEFT', 'REMOVED');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DishSource" AS ENUM ('MANUAL', 'AI_GENERATED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "DishStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');

-- CreateEnum
CREATE TYPE "StorageLocation" AS ENUM ('FRIDGE', 'FREEZER', 'PANTRY', 'OTHER');

-- CreateEnum
CREATE TYPE "LetterUnlockType" AS ENUM ('DATE', 'DISH_COUNT', 'MEAL_COUNT', 'MANUAL');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "devKey" TEXT,
    "wechatOpenId" TEXT,
    "nickname" VARCHAR(80) NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "heightCm" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "activityLevel" TEXT,
    "calorieTarget" INTEGER,
    "preferences" JSONB,
    "allergens" TEXT[],
    "avoidIngredients" TEXT[],

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kitchen" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "avatarUrl" TEXT,
    "slogan" VARCHAR(160),
    "maxMembers" INTEGER NOT NULL DEFAULT 2,
    "defaultServings" INTEGER NOT NULL DEFAULT 2,
    "defaultCalorieTarget" INTEGER,
    "relationshipStartedAt" TIMESTAMP(3),
    "anniversaryAt" TIMESTAMP(3),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Kitchen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenMember" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "KitchenRole" NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "KitchenMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenInvite" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedBy" UUID,
    "revokedAt" TIMESTAMP(3),
    "status" "InviteStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitchenInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dish" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000),
    "category" TEXT,
    "cuisine" TEXT,
    "coverImageUrl" TEXT,
    "difficulty" INTEGER,
    "prepMinutes" INTEGER,
    "cookMinutes" INTEGER,
    "servings" INTEGER NOT NULL DEFAULT 2,
    "caloriesPerServing" DOUBLE PRECISION,
    "proteinG" DOUBLE PRECISION,
    "fatG" DOUBLE PRECISION,
    "carbsG" DOUBLE PRECISION,
    "tags" TEXT[],
    "sourceType" "DishSource" NOT NULL DEFAULT 'MANUAL',
    "createdBy" UUID NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "status" "DishStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Dish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishIngredient" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "ingredientId" UUID,
    "displayName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "weightGrams" DOUBLE PRECISION,
    "calories" DOUBLE PRECISION,
    "proteinG" DOUBLE PRECISION,
    "fatG" DOUBLE PRECISION,
    "carbsG" DOUBLE PRECISION,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "DishIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeStep" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "stepNo" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "imageUrl" TEXT,
    "tip" TEXT,
    "heatLevel" TEXT,

    CONSTRAINT "RecipeStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishReview" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tasteRating" INTEGER NOT NULL,
    "appearanceRating" INTEGER NOT NULL,
    "careRating" INTEGER NOT NULL,
    "difficulty" INTEGER,
    "spicyLevel" INTEGER,
    "saltiness" INTEGER,
    "eatAgain" BOOLEAN NOT NULL,
    "content" TEXT,
    "noteToCook" TEXT,
    "imageUrls" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DishReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPreferenceSession" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "mealDate" DATE NOT NULL,
    "mealType" "MealType" NOT NULL,
    "compatibilityScore" INTEGER,
    "revealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealPreferenceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPreferenceSubmission" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "hiddenBeforeReveal" BOOLEAN NOT NULL DEFAULT true,
    "preferencePayload" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revealedAt" TIMESTAMP(3),

    CONSTRAINT "MealPreferenceSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "relatedResourceType" TEXT,
    "relatedResourceId" UUID,
    "generatedBySystem" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlanGroup" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "weekStart" DATE NOT NULL,
    "title" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealPlanGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "dishId" UUID,
    "mealDate" DATE NOT NULL,
    "mealType" "MealType" NOT NULL,
    "servings" INTEGER NOT NULL DEFAULT 2,
    "cookUserId" UUID,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdBy" UUID NOT NULL,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealVote" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "mealPlanId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "MealVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealLog" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "mealPlanId" UUID,
    "dishId" UUID,
    "eatenAt" TIMESTAMP(3) NOT NULL,
    "mealType" "MealType" NOT NULL,
    "servings" DOUBLE PRECISION NOT NULL,
    "eaterUserIds" TEXT[],
    "calories" DOUBLE PRECISION,
    "proteinG" DOUBLE PRECISION,
    "fatG" DOUBLE PRECISION,
    "carbsG" DOUBLE PRECISION,
    "notes" TEXT,
    "imageUrls" TEXT[],
    "cookedBy" UUID,
    "createdBy" UUID NOT NULL,
    "wasPlanned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CookingAssignment" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "assignmentDate" DATE NOT NULL,
    "mode" TEXT NOT NULL,
    "chefUserId" UUID,
    "assistantUserId" UUID,
    "dishwasherUserId" UUID,
    "shopperUserId" UUID,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CookingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PantryItem" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedIngredientId" UUID,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "weightGrams" DOUBLE PRECISION,
    "purchasedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "storageLocation" "StorageLocation" NOT NULL,
    "createdBy" UUID NOT NULL,
    "updatedBy" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PantryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingItem" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "category" TEXT,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "assignedTo" UUID,
    "estimatedPrice" DECIMAL(10,2),
    "actualPrice" DECIMAL(10,2),
    "source" TEXT NOT NULL,
    "relatedMealPlanId" UUID,
    "createdBy" UUID NOT NULL,
    "checkedBy" UUID,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShoppingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionFood" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "caloriesPer100g" DOUBLE PRECISION NOT NULL,
    "proteinPer100g" DOUBLE PRECISION NOT NULL,
    "fatPer100g" DOUBLE PRECISION NOT NULL,
    "carbsPer100g" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionFood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIConversation" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT,
    "purpose" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMessage" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenStory" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "dishId" UUID,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "storyDate" DATE NOT NULL,
    "coverImageUrl" TEXT,
    "imageUrls" TEXT[],
    "createdBy" UUID NOT NULL,
    "storyType" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "KitchenStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AchievementDefinition" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "criterion" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AchievementDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenAchievement" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "definitionId" UUID NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "KitchenAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anniversary" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "repeatsYearly" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Anniversary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoveLetter" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "encryptedContent" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "recipientUserId" UUID NOT NULL,
    "unlockType" "LetterUnlockType" NOT NULL,
    "unlockAt" TIMESTAMP(3),
    "unlockDishCount" INTEGER,
    "unlockMealCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'LOCKED',
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LoveLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadFile" (
    "id" UUID NOT NULL,
    "kitchenId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UploadFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "kitchenId" UUID,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" UUID,
    "requestId" TEXT NOT NULL,
    "ipHash" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_devKey_key" ON "User"("devKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_wechatOpenId_key" ON "User"("wechatOpenId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_expiresAt_idx" ON "RefreshToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Kitchen_deletedAt_idx" ON "Kitchen"("deletedAt");

-- CreateIndex
CREATE INDEX "KitchenMember_userId_status_idx" ON "KitchenMember"("userId", "status");

-- CreateIndex
CREATE INDEX "KitchenMember_kitchenId_status_idx" ON "KitchenMember"("kitchenId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenMember_kitchenId_userId_key" ON "KitchenMember"("kitchenId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenInvite_tokenHash_key" ON "KitchenInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "KitchenInvite_kitchenId_status_expiresAt_idx" ON "KitchenInvite"("kitchenId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "Dish_kitchenId_deletedAt_createdAt_idx" ON "Dish"("kitchenId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Dish_kitchenId_name_idx" ON "Dish"("kitchenId", "name");

-- CreateIndex
CREATE INDEX "DishIngredient_kitchenId_dishId_idx" ON "DishIngredient"("kitchenId", "dishId");

-- CreateIndex
CREATE INDEX "RecipeStep_kitchenId_dishId_idx" ON "RecipeStep"("kitchenId", "dishId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeStep_dishId_stepNo_key" ON "RecipeStep"("dishId", "stepNo");

-- CreateIndex
CREATE INDEX "DishReview_kitchenId_dishId_idx" ON "DishReview"("kitchenId", "dishId");

-- CreateIndex
CREATE UNIQUE INDEX "DishReview_dishId_userId_key" ON "DishReview"("dishId", "userId");

-- CreateIndex
CREATE INDEX "MealPreferenceSession_kitchenId_mealDate_idx" ON "MealPreferenceSession"("kitchenId", "mealDate");

-- CreateIndex
CREATE UNIQUE INDEX "MealPreferenceSession_kitchenId_mealDate_mealType_key" ON "MealPreferenceSession"("kitchenId", "mealDate", "mealType");

-- CreateIndex
CREATE INDEX "MealPreferenceSubmission_kitchenId_sessionId_idx" ON "MealPreferenceSubmission"("kitchenId", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "MealPreferenceSubmission_sessionId_userId_key" ON "MealPreferenceSubmission"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "TimelineEvent_kitchenId_eventDate_idx" ON "TimelineEvent"("kitchenId", "eventDate");

-- CreateIndex
CREATE INDEX "MealPlanGroup_kitchenId_idx" ON "MealPlanGroup"("kitchenId");

-- CreateIndex
CREATE UNIQUE INDEX "MealPlanGroup_kitchenId_weekStart_key" ON "MealPlanGroup"("kitchenId", "weekStart");

-- CreateIndex
CREATE INDEX "MealPlan_kitchenId_mealDate_idx" ON "MealPlan"("kitchenId", "mealDate");

-- CreateIndex
CREATE INDEX "MealVote_kitchenId_idx" ON "MealVote"("kitchenId");

-- CreateIndex
CREATE UNIQUE INDEX "MealVote_mealPlanId_userId_key" ON "MealVote"("mealPlanId", "userId");

-- CreateIndex
CREATE INDEX "MealLog_kitchenId_eatenAt_idx" ON "MealLog"("kitchenId", "eatenAt");

-- CreateIndex
CREATE INDEX "CookingAssignment_kitchenId_idx" ON "CookingAssignment"("kitchenId");

-- CreateIndex
CREATE UNIQUE INDEX "CookingAssignment_kitchenId_assignmentDate_key" ON "CookingAssignment"("kitchenId", "assignmentDate");

-- CreateIndex
CREATE INDEX "PantryItem_kitchenId_status_expiresAt_idx" ON "PantryItem"("kitchenId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "ShoppingItem_kitchenId_checked_idx" ON "ShoppingItem"("kitchenId", "checked");

-- CreateIndex
CREATE UNIQUE INDEX "NutritionFood_name_key" ON "NutritionFood"("name");

-- CreateIndex
CREATE INDEX "AIConversation_kitchenId_userId_idx" ON "AIConversation"("kitchenId", "userId");

-- CreateIndex
CREATE INDEX "AIMessage_kitchenId_conversationId_idx" ON "AIMessage"("kitchenId", "conversationId");

-- CreateIndex
CREATE INDEX "KitchenStory_kitchenId_deletedAt_storyDate_idx" ON "KitchenStory"("kitchenId", "deletedAt", "storyDate");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementDefinition_code_key" ON "AchievementDefinition"("code");

-- CreateIndex
CREATE INDEX "KitchenAchievement_kitchenId_idx" ON "KitchenAchievement"("kitchenId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenAchievement_kitchenId_definitionId_key" ON "KitchenAchievement"("kitchenId", "definitionId");

-- CreateIndex
CREATE INDEX "Anniversary_kitchenId_date_idx" ON "Anniversary"("kitchenId", "date");

-- CreateIndex
CREATE INDEX "LoveLetter_kitchenId_recipientUserId_status_idx" ON "LoveLetter"("kitchenId", "recipientUserId", "status");

-- CreateIndex
CREATE INDEX "Notification_kitchenId_userId_readAt_idx" ON "Notification"("kitchenId", "userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "UploadFile_storageKey_key" ON "UploadFile"("storageKey");

-- CreateIndex
CREATE INDEX "UploadFile_kitchenId_deletedAt_idx" ON "UploadFile"("kitchenId", "deletedAt");

-- CreateIndex
CREATE INDEX "AuditLog_kitchenId_createdAt_idx" ON "AuditLog"("kitchenId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenMember" ADD CONSTRAINT "KitchenMember_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenMember" ADD CONSTRAINT "KitchenMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenInvite" ADD CONSTRAINT "KitchenInvite_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishIngredient" ADD CONSTRAINT "DishIngredient_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeStep" ADD CONSTRAINT "RecipeStep_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishReview" ADD CONSTRAINT "DishReview_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPreferenceSubmission" ADD CONSTRAINT "MealPreferenceSubmission_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MealPreferenceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "MealPlanGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealVote" ADD CONSTRAINT "MealVote_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenAchievement" ADD CONSTRAINT "KitchenAchievement_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "AchievementDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
