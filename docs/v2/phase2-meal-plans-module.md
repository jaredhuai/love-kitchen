# Phase 2：Meal Plans 模块化

日期：2026-07-18。第十项的第六个单模块提交。

## 变更范围

- 将 Meal Plans 与 Cooking Assignment 从 301 行单文件拆分为 Presentation/Application/Domain 和独立 `MealPlansModule`。
- 旧 `modules/meal-plans.ts` 保留 re-export，避免内部引用破坏。
- 保留 Phase 1 的 KitchenResourcePolicy、关联资源同事务验证和 Outbox 审计。
- 菜单不存在统一为 `MEAL_PLAN_NOT_FOUND`。

## 兼容与测试

- v1 路径、DTO、响应和事务语义不变。
- 真实 AppModule/PostgreSQL IDOR E2E 6/6 和 Meal History 回归 4/4 通过。
- 全量质量门结果记录在本批交付说明。

## 风险与回滚

- Meal Plans v2 读写契约未在本批扩张；本批仅收敛模块边界与错误。
- 当前删除仍是硬删除，需在后续领域策略中确认。
- 回滚时可恢复单文件并从 AppModule 移除 `MealPlansModule`；无数据库变更，不需数据回滚。
