# Phase 4：M3 Outbox/幂等生产治理完成记录

日期：2026-07-20。对应剩余执行计划任务 4。

## 完成范围

- Worker 单次 drain 有可配置批次上限；同一进程的重叠 poll 合并到同一在途 Promise，不会重复启动消费循环。
- SIGTERM/SIGINT 先停定时器和新任务，再等待消费与清理在途 Promise，最后断开数据库。
- PROCESSING lease 可配置；过期 lease 在抢占事务内恢复为 PENDING，`FOR UPDATE SKIP LOCKED` 与 AuditLog 唯一消费键继续保证多 Worker 安全。
- `IdempotencyKey` 按 `expiresAt < now` 排序、限量删除，并在删除条件中再次检查过期时间；未过期键不会删除。
- 每轮消费输出 pending、processing、dead、最老 pending 年龄和 measuredAt，不包含事件 payload、主体或租户数据。
- backlog、dead-letter 和最老事件年龄阈值可通过环境变量配置；达到阈值时输出稳定告警代码。
- 审计 Consumer 明确拒绝 `aggregateType=SecurityEvent`。SecurityEvent 保持独立安全域，后续只能接入专用白名单 Consumer；拒绝原因仍只保存异常类型。

## 配置

生产必须显式评审 `.env.example` 中的 Worker poll、lease、批次、清理周期/批次和三类告警阈值。阈值为 0 表示禁用对应告警；不能通过阈值关闭指标采集。

## 验收证据

- Worker 类型检查通过。
- Worker 真实 PostgreSQL与运行时测试 10/10：业务/事件原子回滚、幂等消费、双 Worker 并发、重试/死信、lease 恢复、过期键分批清理且保留有效键、指标与阈值、安全事件边界、同进程防重入、优雅停机。
- 六个 Migration 在 `love_kitchen_test` 无待部署项。

## 运维与回滚

1. Worker 异常时先停 Worker 和幂等清理调度，不删除 OutboxEvent、IdempotencyKey、AuditLog 或 SecurityEvent。
2. 待修复后从 PENDING 和 lease 到期的 PROCESSING 继续；DEAD 事件需人工审查事件类型与脱敏 payload 后再决定重放。
3. backlog、DEAD 或最老事件年龄告警时，先确认数据库容量、消费者错误率和 lease；禁止以清空表解除告警。
4. 回滚旧 Worker 镜像不会改变 Schema；新指标字段仅为进程输出，不需要数据库降级。
