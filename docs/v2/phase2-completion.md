# Phase 2：后端模块化与 API v2 完成记录

日期：2026-07-18。范围为执行顺序第十项。

## 模块边界

- 所有业务域均已从根级单文件注册迁入独立 Nest Module；根级同名文件仅保留兼容导出。
- Dishes、Timeline、Meal History、Notifications、AI Conversations 已建立 Controller / Application / Domain / Repository 分层，并以 `kitchenId` 和当前用户约束私密资源。
- Meal Plans 使用共享 `KitchenResourcePolicy`；Preferences/Nutrition、Uploads、Love Letters、Pantry/Shopping、Memories、Kitchens、Auth、Achievements 已拆分 Controller / Application / Domain 或 Adapter 边界。简单派生或事务型模块暂不制造无行为的 Repository 包装层。
- `InfraModule` 全局只提供一个 Prisma/Redis 实例，避免每个功能模块创建独立连接池。

## v2 与错误契约

- `/api/v1` 保持兼容并返回 Deprecation/Sunset；正式增量 v2 覆盖五个优先列表。
- 五个列表统一使用稳定复合 Cursor：Dishes、Notifications、AI Conversations 为 `createdAt + id`，Timeline 为 `eventDate + id`，Meal History 为 `eatenAt + id`。
- v2 成功响应统一为 `success/data/meta/requestId`；异常统一为 `success/error/meta/requestId`，跨厨房资源使用不泄露存在性的 404。
- DTO 校验固定返回 `VALIDATION_ERROR`，`details` 包含字段路径及约束消息；业务错误、非法 Cursor、幂等冲突和权限错误均具有稳定 code。
- `@love-kitchen/api-contracts` 为五个 Cursor 页面提供 Zod 契约。

## 幂等范围核对

Phase 2 的可用 v2 写面已全部覆盖：

| v2 写接口 | 策略 |
|---|---|
| Dishes POST | 必须提供 `Idempotency-Key`；业务与响应同一 Serializable 事务 |
| Timeline POST | 同上 |
| Meal History POST | 同上，并与 Outbox 同事务 |
| Notifications PATCH read | 状态设置天然幂等，不要求 Key |
| AI Conversations | 本阶段仅开放读取；付费 POST 留给 Phase 6 Orchestrator |

其余写接口仍是 v1 兼容面，不作为新的 v2 幂等承诺：认证刷新必须由 Phase 4 Session Rotation 定义重放语义；上传需要上传会话；AI 需要计费/配额协调；邀请、偏好状态机、情书和普通 CRUD 在其 v2 暴露时按风险选择持久幂等或天然幂等。该边界避免用数据库长事务包裹外部调用或错误重放安全令牌。

`IdempotencyKey` 24 小时清理、容量指标和 SecurityEvent 属于 Phase 3 数据库生产化，不影响 Phase 2 接口语义已经完成的结论。

## 验证与回滚

- 模块迁移均以独立提交完成，并先运行聚焦类型检查、lint 与真实回归。
- 五个 v2 Contract/E2E 覆盖相同排序键翻页无重漏、非法 Cursor、资源隔离及三类 POST 并发同键/异 body 冲突。
- 2026-07-18 根质量门全部真实通过：`quality:prepare`、`lint`、`typecheck`、`build`；workspace `test`（API 19 files / 88 tests，另含 contracts 5、validation 2、worker 5）；`test:e2e` 11 files / 52 tests；`test:security` 44 tests；`test:coverage` 19 files / 88 tests（总行 85.14%、分支 78.93%、函数 66.37%）；`test:migration` 2/2，5 个 Migration 无待执行项。
- PostgreSQL 使用专用 `love_kitchen_test`，Redis 使用 DB 15；没有通过 skip 或 mock 制造绿色结果。
- 回滚时可按模块提交逆序回退；v1 Controller 兼容导出和数据库中的 IdempotencyKey/Outbox 数据必须保留。
