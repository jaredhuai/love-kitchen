# Phase 1：Outbox 可靠审计完成记录

日期：2026-07-12。范围为执行顺序第七项，不进入情书安全测试。

## 完成内容

- 删除业务响应后直接写 AuditLog 的全局 AuditInterceptor，避免业务已提交但审计失败。
- M3 新增 OutboxEvent、PENDING/PROCESSING/PROCESSED/DEAD 状态、可用时间/重试/错误字段和消费索引；AuditLog 增加唯一 `outboxEventId`。
- `enqueueAudit(tx, event)` 只接受主体、租户、聚合 ID、事件类型和资源 ID；菜单创建/投票/分工/用餐记录、偏好提交/揭晓/关闭、AI 结果、情书创建均与业务写入同一 Prisma 事务。
- 独立 `apps/worker` 使用 `FOR UPDATE SKIP LOCKED` 抢占；AuditLog Upsert 和 Outbox PROCESSED 在同一事务，唯一键保证崩溃重放幂等。
- 失败指数退避，默认五次进入 DEAD；lastError 只存异常类型，不保存 Token、正文、Prompt、微信身份或密钥。
- Payload 使用 strict Zod 白名单，额外敏感字段会拒绝消费并进入重试/死信。

## 测试与证据

- `pnpm test:outbox`：真实 PostgreSQL 5/5。
- 覆盖业务/事件强制回滚、成功消费和重复调用幂等、双 Worker 并发只消费一次、敏感字段拒绝、退避重试和 DEAD。
- API 49/49 继续通过；最终 workspace lint/typecheck/test/build 结果记录在交付说明。

## 风险

- 本项覆盖高风险业务写路径，普通菜品/库存/故事等旧写路径不再由不可靠拦截器生成假审计；它们应在各模块化 PR 中采用同一事务模板，而不是恢复拦截器。
- Worker 是轮询实现；生产必须保证单实例优雅退出、连接池预算、backlog/DEAD/事件年龄指标和告警。
- PROCESSING 使用五分钟 lease，后续 claim 会把超时事件恢复 PENDING；极慢消费者可能发生重复执行，因此所有新增 Consumer 仍必须幂等。
- M3 的 IdempotencyKey 和 SecurityEvent 尚未实现，数据库生产化任务保持未完成。

## 回滚方案

1. Worker 故障时立即停 Worker，Outbox backlog 保留；业务写入继续原子产生事件，修复后可重放。
2. 禁止恢复事后 AuditInterceptor。若事件写入导致业务失败，应修复事件 Schema/容量后重试业务。
3. M3 数据结构不做向下删除；应用回滚时保留 Outbox 表和 AuditLog 唯一列，避免丢失待处理证据。
4. 错误消费者发布时停 Worker、回滚 Worker 镜像并从 PENDING/超时 PROCESSING 继续；不得清空 backlog。
