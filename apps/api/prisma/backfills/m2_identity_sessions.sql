-- Idempotent M2 compatibility backfill for rows created by the legacy application
-- during the expand/double-write deployment window.
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
