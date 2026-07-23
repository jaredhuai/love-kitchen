# Phase 2：Meal History 模块 v2 增量迁移

日期：2026-07-18。第十项的第三个单模块提交；第十项保持 `IN_PROGRESS`。

## 变更范围

- 将 Meal History 从 `meal-plans.ts` 拆分为 Presentation/Application/Domain/Infrastructure 四层和独立 `MealHistoryModule`。
- 保留 v1 查询与创建，新增 v2 查询与创建。
- v2 列表使用 `(eatenAt DESC, id DESC)` 稳定复合游标，`limit` 限制为 1–50。
- v2 创建要求 `Idempotency-Key`，MealLog、Outbox 审计和幂等响应在同一 Serializable 事务中持久化。
- 保留 Phase 1 的厨房资源 Policy：`mealPlanId`、`dishId`、用餐者和烹饪者必须属于当前厨房。
- `@love-kitchen/api-contracts` 新增 MealLog/page Zod 契约。

## v1 兼容策略

- `GET /api/v1/kitchens/:kitchenId/meal-history` 仍返回数组。
- `POST /api/v1/kitchens/:kitchenId/meal-history` 不强制幂等 Key，输入字段和默认用餐者行为保持不变。
- v1 继续返回 `Deprecation: true` 和 2027-12-31 `Sunset` 提示。

## v2 契约

- `GET /api/v2/kitchens/:kitchenId/meal-history?limit=<1..50>&cursor=<opaque>` 返回 `{ items, pageInfo }`。
- 游标编码 `eatenAt + id`；非法游标返回 HTTP 400 / `INVALID_CURSOR`。
- `POST /api/v2/kitchens/:kitchenId/meal-history` 缺少 Key 返回 `IDEMPOTENCY_KEY_REQUIRED`；同 Key 同 body 重放，同 Key 异 body 返回 HTTP 409 / `IDEMPOTENCY_CONFLICT`。
- v2 响应使用统一 envelope 并包含 `meta: null`。

## 测试证据

- Meal History v1/v2 真实 AppModule + PostgreSQL E2E：4/4 通过。
- Meal History + IDOR + Dishes + Timeline 聚焦回归：18/18 通过。
- 游标测试使用三条相同 `eatenAt` 数据，验证两页无重复、无遗漏。
- 并发幂等测试验证仅一条 MealLog 和一条 Outbox 审计。
- 全量质量门结果记录在本批交付说明。

## 风险

- 生产数据量增长前应在 Phase 3 评估 `(kitchenId,eatenAt,id)` 复合索引。
- v1 是无上限数组读，前端迁移 v2 前仍存在大响应风险。
- 幂等记录清理 Job 和容量指标尚未完成。
- 第十项仍未完成；Notifications 和 AI sessions 等模块待迁移。

## 回滚方案

1. 关闭 `MealHistoryV2Controller` 并保留 v1 Controller，现有客户端不受影响。
2. 应用可回滚到 `MealPlansService`；`IdempotencyKey`、MealLog 和 Outbox 记录保留，不执行破坏性数据回滚。
3. 游标异常时可临时关闭 v2 读，v1 数组读继续服务。
4. 回滚 Contract 前同步确认尚未发布的消费端，避免版本错配。
