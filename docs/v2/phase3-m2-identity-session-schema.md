# Phase 3 M2：身份与会话 Expand Schema

日期：2026-07-20。范围为剩余工作任务 2，仅增加兼容 Schema、回填和 Migration 验证；认证读写切换属于任务 3。

## 变更

- 新增 `WechatIdentity`，唯一约束为 `(appId, openId)` 和 `(userId, appId)`；不保存微信 `session_key`。
- 新增 `RefreshTokenSession`。每个 Refresh Token 保留独立记录、family、rotation 链、设备摘要、撤销原因和重用检测时间，支持后续事务 Rotation 与 family revoke。
- 新增 `SecurityEvent` 以及稳定事件类型/严重度枚举。事件只允许主体、租户、requestId、IP hash 和受控 metadata，不保存 Token、code、session_key 或私密正文。
- `User.wechatOpenId` 与旧 `RefreshToken` 保留，旧应用可继续运行；本项不做破坏性 Contract。

## 回填

- Migration 首次回填已有微信身份，使用 `appId=legacy-unscoped`；任务 3 在验证真实 `WECHAT_APP_ID` 后兼容读取并迁移到正式 appId。
- 微信身份 ID 由 User UUID 的确定性 MD5 UUID 派生，使补偿回填可重入且不依赖 PostgreSQL 扩展。
- 每个旧 RefreshToken 回填为同 ID、同 hash、`familyId=id` 的 Session；旧撤销状态映射为 `LEGACY_REVOKED`。
- `prisma/backfills/m2_identity_sessions.sql` 可在 Expand/双写窗口重复执行，使用唯一约束和 `ON CONFLICT DO NOTHING` 防止重复数据。

## 数据检查

执行前：

```sql
SELECT "wechatOpenId", COUNT(*) FROM "User"
WHERE "wechatOpenId" IS NOT NULL GROUP BY "wechatOpenId" HAVING COUNT(*) > 1;
SELECT "tokenHash", COUNT(*) FROM "RefreshToken" GROUP BY "tokenHash" HAVING COUNT(*) > 1;
```

执行后：

```sql
SELECT COUNT(*) FROM "User" u
WHERE u."wechatOpenId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "WechatIdentity" w WHERE w."userId" = u."id" AND w."openId" = u."wechatOpenId"
);
SELECT COUNT(*) FROM "RefreshToken" r
WHERE NOT EXISTS (SELECT 1 FROM "RefreshTokenSession" s WHERE s."id" = r."id" AND s."tokenHash" = r."tokenHash");
```

两项结果都必须为 0。Migration 在新建三张表和索引时取得短暂 DDL 锁；回填只读取旧身份/Token 表并写新表，不更新旧行，预计耗时与旧身份和有效/历史 Token 数量线性相关。

## 验证

- Prisma Schema validate/generate/typecheck 通过。
- `20260720090000_identity_sessions` 已在专用 `love_kitchen_test` 成功 deploy。
- Migration contract 验证 6 个 Migration 全部完成、新表/敏感字段边界，以及补偿脚本连续执行两次仍各产生一条记录：4/4 通过。
- 完整质量门通过：quality prepare、lint、typecheck、build；workspace test（API 19 files / 90 tests，另含 contracts 5、validation 2、worker 5）；真实 E2E 52/52；安全门 44/44；coverage 90/90（总行 85.14%、分支 78.97%、函数 66.37%）；最终自包含 Migration 门 4/4。所有数据库测试均使用精确的 `love_kitchen_test`。

## 回滚

- 应用回滚无需 Schema 回滚：旧 User/RefreshToken 未删除或改写。
- 新表写入异常时停止任务 3 切换，修复并重跑可重入回填。
- 不在生产 DROP 新表/枚举；若字段或约束需要调整，使用新的 Roll-forward Migration。
