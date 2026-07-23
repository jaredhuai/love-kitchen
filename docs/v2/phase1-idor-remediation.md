# Phase 1：菜单关联 IDOR 修复记录

完成日期：2026-07-11

分支：`fix/v2-security-blockers`

范围：仅菜单、投票、做饭分工和饮食记录的跨厨房关联。

## 完成内容

- 新增 `KitchenResourcePolicy`，统一按 `resourceId + kitchenId` 校验菜品、菜单和 ACTIVE 成员。
- 菜单创建、更新、投票、分工和饮食记录的关联验证与写入进入同一 Prisma 事务。
- 菜单更新改用运行时有效的 `UpdateMealDto`，不再使用 `Partial<MealDto>`。
- 饮食记录支持并验证可选 `mealPlanId`、`eaterUserIds`、`cookedBy`。
- 跨厨房关联统一返回 404“关联资源不存在”，不泄露目标资源存在性。
- 新增真实 AppModule + PostgreSQL + Redis IDOR E2E，并纳入 API 默认测试发现规则。

## 修改文件

- `apps/api/src/security/kitchen-resource.policy.ts`
- `apps/api/src/security/kitchen-access.guard.ts`
- `apps/api/src/common/audit.interceptor.ts`
- `apps/api/src/modules/meal-plans.ts`
- `apps/api/src/app.module.ts`
- `apps/api/test/meal-plans.idor.e2e.spec.ts`
- `apps/api/package.json`
- `package.json`
- Phase 0/1 文档和任务清单

## API 变化

- 路径保持 v1 兼容，没有删除或改名。
- `PATCH /meal-plans/:id` 现在执行真实 DTO 白名单和字段验证。
- `POST /meal-history` 新增可选 `mealPlanId`、`eaterUserIds`、`cookedBy`。
- 非本厨房的 dish/plan/member 关联由可能写入数据改为 404。

## 数据库变化

- Prisma Schema 与 Migration 均无变化。
- 本地新建独立 `love_kitchen_test` 数据库并应用现有 Migration，仅用于测试。
- 测试每次只清理 dedicated test database；代码显式检查 URL 必须包含 `love_kitchen_test`。

## 安全验证

真实 E2E 覆盖：

1. A 厨房不能使用 B 菜品创建菜单。
2. A 菜单不能更新为 B 菜品或 B 成员主厨。
3. A 成员不能通过 A 路径给 B 菜单投票。
4. A 厨房不能把 B 成员设置为分工人员。
5. A 厨房不能用 B 菜品或 B 菜单创建饮食记录。
6. 合法 A 厨房关联仍可成功，避免安全修复破坏正常流程。

## 兼容性影响

- 以前被错误接受的跨厨房/无效关联现在返回 404，属于预期安全收紧。
- Update DTO 会拒绝未声明字段，可能暴露旧客户端的非法请求；v1 合法字段保持兼容。
- 默认 API 测试现在要求本地 PostgreSQL/Redis 和 `love_kitchen_test`，CI 必须提供对应服务。

## 发现但未在本项修复的问题

- dev-login 将十六进制 jti 写入 UUID 类型 RefreshToken.id，真实 PostgreSQL 返回 500；已加入认证阶段任务。
- Vitest 源码转译不保留 Nest 构造参数元数据；安全关键 Guard、Policy、Controller 和 AuditInterceptor 已改显式 `@Inject`，其余模块将在真实 E2E 阶段盘点。
- 通用 HTTP/PostgreSQL 基线测试仍有两个默认 skip，留给顺序第 4 项“真实 E2E”。

## 风险

- Policy 依赖应用事务，数据库尚不能通过复合外键保证子表 kitchenId 与父资源一致。
- test 数据库 URL 默认值只适用于本地；CI/Staging 必须通过 `TEST_DATABASE_URL` 覆盖。
- 审计仍不是业务同事务 Outbox，本轮只修复真实测试所需的显式注入。

## 回滚计划

- 回滚本阶段单一提交即可恢复代码；没有数据库 Migration 需要回滚。
- 不建议回滚安全校验；若合法请求回归，应修正 DTO/Policy，不得重新允许跨厨房关联。
- 测试数据库可独立删除，不影响开发数据库和现有数据卷。

## 真实命令结果

| 命令 | 结果 |
|---|---|
| `pnpm test:idor` | 6/6 通过 |
| `pnpm lint` | 通过 |
| `pnpm typecheck` | 通过 |
| `pnpm test` | API 21 通过、2 跳过；validation 2 通过 |
| `pnpm build` | 通过 |

两个跳过项未被视为通过，将在真实 E2E 阶段移除。
