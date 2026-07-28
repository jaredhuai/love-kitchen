# Phase 7：AI Orchestrator 完成记录

日期：2026-07-20。对应剩余执行计划任务 7。

## 编排边界

- Provider 只负责真实请求、错误映射、JSON/Zod 与一次修复；Orchestrator 在外层负责开关、持久幂等、配额、并发、总超时、降级和计量。
- 外部 Provider 调用期间没有数据库事务。调用完成后才以 Repository 短事务保存会话/Outbox，再完成 AiUsageRecord。
- `(userId,kitchenId,requestKey)` 唯一；成功或降级重放直接返回保存响应，不再次调用 Provider 或重复创建会话。

## 配额、并发与降级

- Redis Lua 同时检查并递增用户/厨房日额度，不产生单侧预留；成功保留计数，失败和降级减回。
- 每个用户/厨房使用带随机 ownership token 的 Redis NX/EX 单飞锁；释放时 Lua 比对 ownership，不能删除后继请求的锁。
- 编排总超时与 Provider 超时分离；429、超时、未配置和上游不可用可按开关降级到当前厨房已有菜品，不跨厨房读取。
- AI_DISABLED、AI_QUOTA_EXCEEDED、AI_CONCURRENCY_LIMITED 和 IDEMPOTENCY_KEY_REQUIRED 使用稳定错误码。

## 计量与保留

- AiUsageRecord 保存状态、Provider/模型、估算输入/输出 Token、成功成本 micros、延迟、稳定错误码和响应过期时间；不保存原始 Prompt。
- DEGRADED/FAILED 成本为零且不占成功日额度。错误只保存错误码/异常类型，不保存上游正文或 Prompt。
- `/ai/usage` 只返回当前用户/厨房的请求数、状态分布、Token、成本和平均延迟。
- Worker 分批清空到期 response，但保留状态、成本和延迟聚合记录。

## 验收证据

- AI 16/16：Provider 错误/修复、租户边界、幂等、并发、原子配额、成本/延迟、受控降级、安全失败与额度释放。
- Worker 11/11 且连续两次稳定通过：到期 AI response 清空，不影响未过期响应和成本指标；Outbox 无回归。
- 完整 API 24 files / 115 tests；Migration 7/7，九个 Migration 已部署；API/Worker Typecheck 通过。

## 回滚

1. 设置 `AI_ENABLED=false` 停止新调用；不影响非 AI 路由和历史会话读取。
2. 上游不稳定可保留 AI 开关并启用 fallback；成本异常时关闭 AI，保留 AiUsageRecord 调查。
3. 回滚应用保留 AiUsageRecord；Redis key 自然 TTL。不得删除计量记录或把 FAILED/DEGRADED 改为成功。
