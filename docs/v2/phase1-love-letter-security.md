# Phase 1：情书安全完成记录

日期：2026-07-12。范围为执行顺序第八项，不进入下一项根级质量门。

## 完成内容

- M5 增加 `LoveLetter.keyVersion`，历史数据默认/回填为版本 1；创建使用 `LOVE_LETTER_KEY_VERSION`，读取按记录版本选择密钥。
- 版本 1 继续读取既有 `LOVE_LETTER_ENCRYPTION_KEY`；版本 n>1 使用 `LOVE_LETTER_ENCRYPTION_KEY_V<n>`，缺失版本失败关闭且不更新打开状态。
- 创建和列表使用显式字段白名单，不返回 encryptedContent、正文或 keyVersion；Outbox Payload 只包含资源/动作 ID。
- 创建者必须与收件人同属当前厨房的两个 ACTIVE 成员且不能自寄；查询同时约束 id+kitchenId+recipientUserId+deletedAt。
- DATE、DISH_COUNT、MEAL_COUNT、MANUAL 四类条件均由服务端当前厨房数据判定；只有创建者能手动解锁，只有收件人能打开正文。
- 创建、手动解锁、首次打开和对应 Outbox 在同一事务；重复打开只读，不重复产生事件。

## 测试与证据

- `pnpm test:letters`：真实 AppModule + PostgreSQL 8/8。
- 覆盖密文/版本/响应白名单、发送者与跨厨房读取、DATE 前后、DISH_COUNT、MEAL_COUNT、MANUAL 双角色、非法收件人不落库、未知 keyVersion 失败关闭。
- M5 Migration 已在 `love_kitchen_test` 通过 `prisma migrate deploy` 执行。

## 风险

- 旧版本密钥丢失会使对应历史密文永久不可解；生产密钥轮换必须先备份、双读验证，再切换写版本。
- 当前密钥来自环境/Secret Manager，尚未接 KMS envelope encryption；不得把任何版本密钥写日志、Outbox 或数据库。
- DISH_COUNT/MEAL_COUNT 按当前有效菜品/累计 MealLog 判定；未来软删或数据修复的业务语义需产品确认。
- 解密失败对客户端表现为通用 500，避免泄露密钥版本细节；安全事件记录留待 M3 SecurityEvent。

## 回滚方案

1. 应用回滚前保持 `keyVersion` 列和所有历史版本密钥；旧应用只能读取 V1，因此不得在存在 V2 数据时直接回退。
2. 新版本写入异常时把 `LOVE_LETTER_KEY_VERSION` 恢复为最近可用版本，保留新版本密钥供已写记录读取。
3. M5 列不做破坏性向下删除；优先 Roll-forward 修复 key 配置或逐条重加密。
4. 解锁异常时关闭写/打开入口，列表元数据仍可安全读取；禁止绕过条件或返回密文作为降级。
