# Phase 1：偏好状态机完成记录

日期：2026-07-12。范围仅为执行顺序第三项，不代表第四项“默认真实 E2E”完成。

## 完成内容

- M1 新增 `MealPreferenceSessionState`、`state`、`version`、`closedAt`，保留原唯一键并增加状态查询索引。
- 历史 `revealedAt` 场次回填为 REVEALED；未揭晓且至少两份提交的场次回填为 READY_TO_REVEAL，其余保持 OPEN。
- submit/reveal/close 使用 PostgreSQL Serializable 事务；对 P2002/P2034 最多重试三次，并用 `state+version` 条件更新防止重复转换。
- OPEN 允许提交和修改；双方有效成员提交后进入 READY_TO_REVEAL；READY 后冻结；揭晓后进入 REVEALED；关闭后进入完全只读的 CLOSED。
- GET 在 OPEN/READY 隐藏对方 payload，在 REVEALED/CLOSED 保持可读；reveal/close 对已完成状态只读幂等。
- mealType 增加运行时枚举校验；新增兼容的 `POST /api/v1/kitchens/:kitchenId/preferences/close`。

## 测试与证据

- Migration：`DATABASE_URL=...love_kitchen_test prisma migrate deploy` 成功。
- `pnpm test:preferences`：真实 AppModule + PostgreSQL 6/6 通过。
- 覆盖：单方隐藏、并发提交、READY 冻结、并发揭晓、REVEALED/CLOSED 只读、非法 mealType。
- 最终根级 lint/typecheck/test/build 结果记录在本提交交付说明中；第四项仍需统一默认 E2E、测试资源和跳过项。

## 风险

- 历史数据按“两份不同用户提交”推导 READY，无法在迁移时证明提交者仍为当前有效成员；上线前需运行一致性查询并人工处理异常场次。
- Serializable 高冲突下最多重试三次，极端并发仍可能返回冲突；客户端应提示用户重试。
- 当前厨房上限为两人。成员离开或替换发生在 READY 前后时，服务会拒绝不一致的揭晓，后续成员领域需定义取消/重开策略。
- API v1 尚无稳定业务错误码；统一错误契约属于 API v2 阶段。

## 回滚方案

1. 首选 Roll-forward：修正异常 session state/version，不删除列或枚举。
2. 应用回滚到旧版本前，先阻断新 submit/reveal 流量；旧版本只识别 `revealedAt`，仍可读取已揭晓数据，但不能安全处理 READY/CLOSED 语义。
3. 紧急降级可将未揭晓的 READY 场次人工恢复 OPEN，将 CLOSED 保留 `revealedAt`；禁止清空 submission 或 revealedAt。
4. PostgreSQL enum/列不做在线向下删除；物理删除仅能在备份验证、应用完全回退后以独立 Contract Migration 执行。
