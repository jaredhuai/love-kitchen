-- M2 expand-only identity/session/security schema.
-- Existing User.wechatOpenId and RefreshToken remain available during the compatibility window.

CREATE TYPE "SecurityEventType" AS ENUM (
  'LOGIN_FAILED', 'TOKEN_REUSED', 'INVITE_BRUTE_FORCE', 'KITCHEN_ACCESS_DENIED',
  'UPLOAD_REJECTED', 'AI_ABUSE', 'RATE_LIMITED'
);
CREATE TYPE "SecurityEventSeverity" AS ENUM ('INFO', 'WARN', 'HIGH');

CREATE TABLE "WechatIdentity" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "appId" VARCHAR(128) NOT NULL,
  "openId" VARCHAR(128) NOT NULL,
  "unionId" VARCHAR(128),
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WechatIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefreshTokenSession" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "familyId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "deviceId" VARCHAR(128),
  "userAgentHash" VARCHAR(128),
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "rotatedFromId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revokeReason" VARCHAR(80),
  "reuseDetectedAt" TIMESTAMP(3),
  CONSTRAINT "RefreshTokenSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecurityEvent" (
  "id" UUID NOT NULL,
  "userId" UUID,
  "kitchenId" UUID,
  "eventType" "SecurityEventType" NOT NULL,
  "severity" "SecurityEventSeverity" NOT NULL DEFAULT 'INFO',
  "requestId" TEXT,
  "ipHash" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WechatIdentity_appId_openId_key" ON "WechatIdentity"("appId", "openId");
CREATE UNIQUE INDEX "WechatIdentity_userId_appId_key" ON "WechatIdentity"("userId", "appId");
CREATE INDEX "WechatIdentity_unionId_idx" ON "WechatIdentity"("unionId");
CREATE UNIQUE INDEX "RefreshTokenSession_tokenHash_key" ON "RefreshTokenSession"("tokenHash");
CREATE UNIQUE INDEX "RefreshTokenSession_rotatedFromId_key" ON "RefreshTokenSession"("rotatedFromId");
CREATE INDEX "RefreshTokenSession_userId_revokedAt_expiresAt_idx" ON "RefreshTokenSession"("userId", "revokedAt", "expiresAt");
CREATE INDEX "RefreshTokenSession_familyId_idx" ON "RefreshTokenSession"("familyId");
CREATE INDEX "SecurityEvent_userId_occurredAt_idx" ON "SecurityEvent"("userId", "occurredAt");
CREATE INDEX "SecurityEvent_kitchenId_occurredAt_idx" ON "SecurityEvent"("kitchenId", "occurredAt");
CREATE INDEX "SecurityEvent_eventType_occurredAt_idx" ON "SecurityEvent"("eventType", "occurredAt");

ALTER TABLE "WechatIdentity" ADD CONSTRAINT "WechatIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefreshTokenSession" ADD CONSTRAINT "RefreshTokenSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefreshTokenSession" ADD CONSTRAINT "RefreshTokenSession_rotatedFromId_fkey" FOREIGN KEY ("rotatedFromId") REFERENCES "RefreshTokenSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_kitchenId_fkey" FOREIGN KEY ("kitchenId") REFERENCES "Kitchen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Deterministic identity IDs make the backfill safe to retry without requiring extensions.
INSERT INTO "WechatIdentity" ("id", "userId", "appId", "openId", "createdAt", "updatedAt")
SELECT (
  substr(md5('wechat-identity:' || "id"::text), 1, 8) || '-' ||
  substr(md5('wechat-identity:' || "id"::text), 9, 4) || '-4' ||
  substr(md5('wechat-identity:' || "id"::text), 14, 3) || '-8' ||
  substr(md5('wechat-identity:' || "id"::text), 18, 3) || '-' ||
  substr(md5('wechat-identity:' || "id"::text), 21, 12)
)::uuid, "id", 'legacy-unscoped', "wechatOpenId", "createdAt", "updatedAt"
FROM "User" WHERE "wechatOpenId" IS NOT NULL
ON CONFLICT ("appId", "openId") DO NOTHING;

INSERT INTO "RefreshTokenSession" ("id", "userId", "familyId", "tokenHash", "issuedAt", "expiresAt", "revokedAt", "revokeReason")
SELECT "id", "userId", "id", "tokenHash", "createdAt", "expiresAt", "revokedAt",
  CASE WHEN "revokedAt" IS NULL THEN NULL ELSE 'LEGACY_REVOKED' END
FROM "RefreshToken"
ON CONFLICT ("id") DO NOTHING;
