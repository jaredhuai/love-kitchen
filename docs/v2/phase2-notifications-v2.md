# Phase 2：Notifications 模块 v2 增量迁移

日期：2026-07-18。第十项的第四个单模块提交；第十项保持 `IN_PROGRESS`。

## 变更范围

- 新建独立 Notifications 四层模块，提供通知列表和标记已读。
- v2 列表使用 `(createdAt DESC, id DESC)` 稳定复合游标，`limit` 限制为 1–50。
- 所有查询和更新同时限定 `kitchenId + userId`，同厨房成员之间也不可读取或修改对方通知。
- `@love-kitchen/api-contracts` 新增 Notification/page Zod 契约。
- 本批不实现通知生产和派发；Outbox Consumer 仍属于 Phase 7。

## v1 兼容策略

- 项目原先无 Notifications HTTP Controller；本批同时提供 `/api/v1` 数组读和 `/api/v2` 分页读，不破坏旧客户端。
- `PATCH /api/v1/kitchens/:kitchenId/notifications/:notificationId/read` 与 v2 使用相同的用户作用域和稳定错误。
- v1 路由返回统一的 Deprecation/Sunset 提示。

## v2 契约

- `GET /api/v2/kitchens/:kitchenId/notifications?limit=<1..50>&cursor=<opaque>` 返回 `{ items, pageInfo }`。
- 游标编码 `createdAt + id`；非法游标返回 HTTP 400 / `INVALID_CURSOR`。
- `PATCH /api/v2/kitchens/:kitchenId/notifications/:notificationId/read` 仅能修改当前用户通知，越权访问与不存在均返回 HTTP 404 / `RESOURCE_NOT_FOUND`。
- PATCH 是天然幂等状态设置，不需要 `Idempotency-Key`。

## 测试证据

- Notifications v1/v2 真实 AppModule + PostgreSQL E2E：4/4 通过。
- 四个优先 v2 模块聚焦回归：16/16 通过。
- 相同 `createdAt` 的三条通知跨两页无重漏。
- 当前用户列表不包含伴侣通知，且无法将伴侣通知标记已读。

## 风险

- 通知尚无 Outbox Consumer、投递幂等、重试和死信处理；这些仍是 Phase 7 范围。
- 生产前应在 Phase 3 评估 `(kitchenId,userId,createdAt,id)` 索引。
- 当前模型无投递通道、投递状态和幂等来源字段，不应在本阶段直接扩展生产派发。
- 第十项仍未完成；AI sessions 待迁移。

## 回滚方案

1. 从 AppModule 移除 `NotificationsModule`，不影响原有功能。
2. 保留 Notification 表和已读状态，不执行破坏性数据回滚。
3. v2 分页异常时可仅关闭 v2 Controller，v1 数组读可继续服务。
4. 回滚 Contract 前确认通知页消费端尚未发布。
