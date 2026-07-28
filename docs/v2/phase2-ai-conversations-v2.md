# Phase 2：AI Conversations 模块 v2 增量迁移

日期：2026-07-18。第十项的第五个单模块提交。

## 变更范围

- 将 `ai.ts` 拆分为 Presentation/Application/Domain/Infrastructure 四层和独立 `AiModule`，旧入口保留 re-export。
- 保留已有菜品推荐 API、Provider Zod 校验、一次修复、事务 Outbox 和稳定 AI 错误。
- 新增当前用户 AI 会话列表和会话详情；会话与消息均限定 `kitchenId + userId`。
- v2 列表使用 `(createdAt DESC, id DESC)` 稳定复合游标，`limit` 限制为 1–50。
- `@love-kitchen/api-contracts` 新增 AIConversation/page Zod 契约。

## v1 兼容策略

- `POST /api/v1/kitchens/:kitchenId/ai/recommendations` 路径、DTO 和响应保持不变。
- 新增 `GET /api/v1/kitchens/:kitchenId/ai/conversations` 数组读和会话详情，不破坏现有客户端。
- v1 继续返回 Deprecation/Sunset 提示。

## v2 契约

- `GET /api/v2/kitchens/:kitchenId/ai/conversations?limit=<1..50>&cursor=<opaque>` 返回 `{ items, pageInfo }`。
- 游标编码 `createdAt + id`；非法游标返回 HTTP 400 / `INVALID_CURSOR`。
- `GET /api/v2/kitchens/:kitchenId/ai/conversations/:conversationId` 返回会话和按时间升序的消息。
- 伴侣会话和不存在会话统一返回 HTTP 404 / `RESOURCE_NOT_FOUND`。
- 本批不暴露 v2 付费 AI POST；在具备可恢复的请求保留和计费协调前，不将外部 AI 调用包在长时间数据库事务中。

## 测试证据

- AI Provider/Service 单元回归 11/11 通过。
- AI Conversations v1/v2 真实 AppModule + PostgreSQL E2E 4/4 通过。
- 五个优先 v2 列表及 AI 回归合计 31/31 通过。
- 相同 `createdAt` 会话跨两页无重漏，伴侣会话无法列出或读取详情。

## 风险

- v2 付费 AI 写路由未开放；其幂等、计费、配额和失败恢复属于 Phase 6 Orchestrator 范围。
- AIConversation/AIMessage 的隐私保留期和删除流程尚未定义。
- 生产前应在 Phase 3 评估 `(kitchenId,userId,createdAt,id)` 复合索引。
- Cursor 优先列表已全部迁移，但第十项整体仍需核对剩余单文件模块和写路由幂等范围。

## 回滚方案

1. 关闭 AI Conversations Controller 时保留 v1 recommendation Controller，不影响现有 AI 推荐。
2. 应用可回滚到 `ai.ts`；AIConversation、AIMessage 和 Outbox 记录保留。
3. v2 分页异常时可仅关闭 v2 列表，v1 数组读可继续服务。
4. 回滚 Contract 前确认 AI 会话消费端尚未发布。
