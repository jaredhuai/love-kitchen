# Phase 2：Preferences / Nutrition 模块化

日期：2026-07-18。第十项的第七个单模块提交。

## 变更范围

- 将 271 行单文件拆分为 Presentation DTO/Controller、Application Service、Domain Error 和独立 `PreferencesNutritionModule`。
- 保留 `OPEN → READY_TO_REVEAL → REVEALED → CLOSED` Serializable 状态机、有限重试、乐观版本和事务 Outbox。
- 新增稳定 `PREFERENCE_SESSION_LOCKED`、`PREFERENCE_ALREADY_REVEALED`、`PREFERENCE_NOT_READY` 和 `PREFERENCE_STATE_CONFLICT`。
- 旧 `preferences-nutrition.ts` 保留 re-export。

## 兼容、风险与回滚

- v1 路径、DTO、响应和状态转换语义不变。
- 真实 AppModule/PostgreSQL 并发状态机 E2E 6/6 通过，并断言锁定与揭晓后错误码。
- 风险为数据库高冲突时有限重试失败；稳定返回 `PREFERENCE_STATE_CONFLICT`。
- 回滚时恢复单文件并移除 Module；无 Schema 变更，不需数据回滚。
