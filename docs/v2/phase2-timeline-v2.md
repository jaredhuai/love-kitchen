# Phase 2：Timeline 模块 v2 增量迁移

日期：2026-07-16。第十项的第二个单模块提交；第十项保持 `IN_PROGRESS`。

## 变更范围

- 将 Timeline 从 `memories.ts` 拆分为 Presentation/Application/Domain/Infrastructure 四层和独立 `TimelineModule`。
- 保留 v1 查询与创建，新增 v2 查询与创建。
- v2 列表使用 `(eventDate DESC, id DESC)` 稳定复合游标，`limit` 限制为 1–50。
- v2 创建要求 `Idempotency-Key`，业务记录和幂等响应在 Serializable 事务中持久化。
- `@love-kitchen/api-contracts` 新增 Timeline event/page Zod 契约。

## v1 兼容策略

- `GET /api/v1/kitchens/:kitchenId/timeline` 仍返回数组，不改为分页对象。
- `POST /api/v1/kitchens/:kitchenId/timeline` 不强制幂等 Key，保持现有客户端行为。
- v1 继续返回 `Deprecation: true` 和 2027-12-31 `Sunset` 提示；v1 前端迁移前不删除路由。

## v2 契约

- `GET /api/v2/kitchens/:kitchenId/timeline?limit=<1..50>&cursor=<opaque>` 返回 `{ items, pageInfo: { nextCursor, hasNextPage } }`。
- 游标编码 `eventDate + id`；伪造、损坏或缺少必需字段的游标返回 HTTP 400 / `INVALID_CURSOR`。
- `POST /api/v2/kitchens/:kitchenId/timeline` 缺少 Key 返回 `IDEMPOTENCY_KEY_REQUIRED`；同 Key 同 body 重放原结果，同 Key 异 body 返回 HTTP 409 / `IDEMPOTENCY_CONFLICT`。
- v2 使用统一 response envelope，包含 `meta: null`。

## 测试证据

- Timeline v1/v2 真实 AppModule + PostgreSQL E2E：4/4 通过。
- Timeline + Dishes 聚焦回归：8/8 通过，覆盖 v1 兼容、非法游标、两页无重漏、并发幂等与异 body 冲突。
- Contract 测试验证合法日期并拒绝非法 `eventDate`。
- 全量质量门结果记录在本批交付说明。

## 风险

- Timeline 仍允许厨房成员创建任意 `eventType`；系统事件与用户事件的 Policy 分离尚未完成。
- 生产数据量增长前应在 Phase 3 评估 `(kitchenId,eventDate,id)` 复合索引。
- 幂等记录的过期清理 Job 和容量指标尚未完成。
- 第十项仍未完成；Meal History、Notifications 和 AI sessions 等模块待逐个迁移。

## 回滚方案

1. 关闭 `TimelineV2Controller` 并保留 `TimelineController`，v1 读写不受影响。
2. 应用代码可回滚到 `MemoriesService`；`IdempotencyKey` 表和已有记录保留，不执行破坏性数据库回滚。
3. 游标异常时可临时关闭 v2 Timeline 读，v1 全量数组读继续服务。
4. 回滚前保留新增 Contract 版本或同步回滚尚未发布的消费端，避免契约错配。
