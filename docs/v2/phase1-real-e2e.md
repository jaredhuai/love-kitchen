# Phase 1：真实 E2E 质量门完成记录

日期：2026-07-12。范围为执行顺序第四项，不包含上传安全及后续项目。

## 完成内容

- 新增根级 `pnpm test:e2e`，先对测试库执行 `prisma migrate deploy`，再运行真实 HTTP、基础设施、IDOR 和偏好并发套件。
- 删除 `RUN_HTTP_TESTS`、`RUN_POSTGRES_TESTS` 条件跳过；默认 `pnpm test` 也会执行这些测试，不再静默假绿。
- PostgreSQL 必须精确为 `love_kitchen_test`，Redis 必须使用逻辑库 15；连接检查同时验证 Migration 已完成和 Redis 可读写。
- HTTP 测试使用真实 AppModule、`/api/v1` 前缀、ValidationPipe、ApiExceptionFilter 和 ResponseInterceptor，并验证健康响应及全局 JWT Guard。
- IDOR 套件从全库清理改为固定厨房/用户/资源 UUID 的作用域清理，避免与其他套件并行时破坏数据。
- 偏好套件原本已采用独立固定 UUID 和作用域清理；两套安全 E2E 可重复执行。

## 测试结果

- `pnpm test:e2e`：16/16 通过，0 skip。
- 覆盖组成：HTTP 2、基础设施 2、菜单 IDOR 6、偏好状态机 6。
- 根级 lint、typecheck、test、build 的最终结果记录在本项提交交付说明。

## 风险

- Redis DB 15 是逻辑隔离而非独立实例；测试禁止 `FLUSHALL`/`FLUSHDB`，CI 应使用独立 Redis 服务以获得物理隔离。
- 本地 PostgreSQL 仍依赖预先创建 `love_kitchen_test` 数据库；脚本会部署 Schema，但不会擅自创建或删除数据库。
- 当前 E2E 覆盖安全阻断项和 HTTP 基础管道，不代表所有业务路由已有端到端覆盖；后续模块必须随 Phase 增加套件。
- 多个套件共享数据库时，新增测试若使用全库 deleteMany 会重新引入污染风险；评审必须检查固定命名空间和删除范围。

## 回滚方案

1. 测试编排变更可独立回退，不改变生产数据或 API 契约。
2. 若本地环境暂时不可用，只允许显式运行纯单元测试文件排障；不得重新引入 skip 并宣称根质量门通过。
3. 若 Redis DB 15 与本机用途冲突，通过 `TEST_REDIS_URL` 指向另一独立 Redis 的 DB 15，不放宽隔离断言。
4. 若迁移失败，停止 E2E，修复 Migration 后 Roll-forward；不得清空开发库或把测试指向开发数据库。
