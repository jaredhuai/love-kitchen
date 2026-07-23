# Phase 2：Love Letters 模块化

日期：2026-07-18。第十项的第九个单模块提交。

## 变更范围

- 拆分 Application Service、Presentation DTO/Controller、Domain Error 和独立 `LoveLettersModule`。
- 保留 DATE、DISH_COUNT、MEAL_COUNT、MANUAL 四种解锁、发/收件人权限、AEAD 加密、密钥版本和事务 Outbox。
- 新增 `LOVE_LETTER_INVALID_CONDITION`、`LOVE_LETTER_INVALID_RECIPIENT` 和统一 `RESOURCE_NOT_FOUND`。
- 旧 `love-letters.ts` 保留 re-export。

## 兼容、风险与回滚

- v1 列表、创建、手动解锁和打开路径不变。
- 真实 AppModule/PostgreSQL 安全 E2E 8/8 通过。
- GET open 仍会更新 `openedAt`；HTTP 语义改为 POST 属于后续 v2 客户端迁移。
- 回滚时恢复单文件并移除 Module；不删除密文、keyVersion 或 Outbox 记录。
