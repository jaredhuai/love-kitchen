# Phase 2：菜品模块 v2 增量迁移

日期：2026-07-13。第十项的第一个单模块提交；第十项保持 IN_PROGRESS。

## 完成内容

- HTTP 启用 Nest URI Versioning，默认版本 1，所以现有 `/api/v1` 无路径破坏；新增 `/api/v2`。v1 响应增加 Deprecation/Sunset，截止 2027-12-31。
- Swagger 拆分 v1/v2 文档并按路径过滤；v2 响应 envelope 增加 `meta`，v1 envelope 保持原样。
- 菜品拆分为 application/domain/infrastructure/presentation 和 DishesModule；旧 `modules/dishes.ts` 仅作兼容 re-export。
- 新建 `@love-kitchen/api-contracts`，提供 v2 错误、Cursor page、菜品 page Zod Contract。
- 菜品 v2 列表用 `(createdAt DESC,id DESC)` Cursor，返回 items/pageInfo；伪造 Cursor 返回 `INVALID_CURSOR`。
- 建立 AppException 和稳定 `RESOURCE_NOT_FOUND`/`KITCHEN_ACCESS_DENIED`；已有 AI 与 Idempotency 错误继续透传。
- 新增 IdempotencyKey Migration 和通用 IdempotencyService。v2 菜品创建在 Serializable 事务内同时保存业务结果和响应；同 Key 同 body 重放，异 body 返回 `IDEMPOTENCY_CONFLICT`。

## 测试

- 真实 AppModule + PostgreSQL v1/v2 E2E 4/4：v1 兼容/废弃 Header、两页无重漏、稳定错误、并发同键无重复和异 body 冲突。
- Contract 包验证 Cursor shape，拒绝 offset shape。
- Migration 已部署到 `love_kitchen_test`；根质量门最终结果记录在本提交交付说明。

## 风险

- 第十项尚未完成：时间轴、饮食历史、通知、AI 会话仍需 Cursor；其余模块仍是单文件；幂等只接入 v2 菜品创建。
- Cursor 依赖 createdAt+id 排序；生产应在数据库生产化阶段补 `(kitchenId,status,createdAt,id)` 复合索引。
- Idempotency 记录 24 小时过期但尚无清理 Job；高流量前必须增加定时清理和容量指标。
- v1 Sunset 是兼容承诺，前端迁移和 UAT 未完成前不得提前删除。

## 回滚

1. 可移除 DishesV2Controller 并保留默认 v1，前端无破坏；不得删除 IdempotencyKey 表中的记录。
2. URI Versioning 回滚前需验证所有 v1 路径；最安全降级是仅关闭 v2 路由而非改全局前缀。
3. Migration 只 Expand，不向下删除；应用回滚时表保留，后续 Roll-forward。
4. Cursor/Contract 异常时 v2 菜品读可临时关闭，v1 offset 继续服务。
