# Phase 8：业务 Outbox Consumers 完成记录

日期：2026-07-20。对应剩余执行计划任务 8。

## 消费模型

- 审计、通知、情书解锁、成就与纪念日提醒在同一 Outbox 抢占后运行；全部成功及 Outbox PROCESSED 在同一短事务提交。
- ConsumerReceipt 以 `(outboxEventId,consumer)` 唯一。通知再以 `(userId,type,sourceKey)` 唯一，业务派生状态使用条件 Update/Upsert；即使人工把事件重置 PENDING，也不会重复通知、解锁或授予成就。
- 识别的聚合类型在消费前校验 `aggregateId+kitchenId`。伪造或陈旧的跨厨房事件失败关闭，仅记录异常类型并进入已有退避/DEAD 流程。

## 业务行为

- DISH_CREATED、MEAL_LOG_CREATED、PREFERENCE_REVEALED 和 AI_RECOMMENDATION_CREATED 只通知同厨房 ACTIVE 伴侣，不向事件发起人重复通知。
- LOVE_LETTER_CREATED 只通知收件人且不包含标题、正文或密文；菜品/用餐计数达到条件时原子解锁并发送固定文案。
- DISH_CREATED 按 AchievementDefinition criterion 的 DISH_COUNT（兼容 DISH_10）幂等更新 KitchenAchievement。
- Worker 按 `REMINDER_TIMEZONE` 生成 DATE 情书和当日纪念日事件；Outbox dedupeKey 保证多实例/重复轮询只生成一次。重复纪念日按本地月日匹配。

## 验收证据

- Consumer E2E 4/4：计数情书+通知重放、跨厨房伪造失败关闭、成就重放、日期情书/纪念日多次调度与消费。
- 完整 Worker 3 files / 15 tests；完整 API 24 files / 116 tests；API/Worker Typecheck、API Lint/Build 通过。
- Migration 8/8，十个 Migration 已在专用测试库部署。

## 回滚与运维

1. 停 Worker 即停止消费和调度；Outbox、收据、通知与派生状态全部保留。
2. Consumer 缺陷修复后只重置目标 DEAD/PENDING 事件；唯一键与收据允许安全重放，禁止清空整表。
3. 调整时区只影响后续每日 dedupeKey；已生成事件不删除。跨时区发布前需检查当天是否已生成提醒。
