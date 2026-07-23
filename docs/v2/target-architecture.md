# 2.0 目标架构

## 目标

在保留 v1 数据和接口兼容的前提下，渐进演进为可测试、可审计、可恢复的双人私密厨房。安全边界以认证用户、有效成员关系、可信 KitchenContext 和资源 `kitchenId` 共同决定。

## 组件

```text
微信小程序
  -> HTTPS/API Gateway
  -> NestJS API v1兼容 + v2
       -> PostgreSQL
       -> Redis
       -> UploadStorageAdapter -> Local/COS私有桶
       -> AiProvider -> Qwen/Mock
       -> OutboxEvent
  -> Worker -> Audit/通知/情书/成就/重试
```

## 后端边界

- Controller：HTTP、DTO、版本协商。
- Application Service：事务和用例编排。
- Domain Policy：权限、状态机、业务约束。
- Repository：所有 Prisma 查询，私密资源默认要求 `kitchenId`。
- Adapter：微信、AI、对象存储、时钟和队列。
- v1 保持兼容；v2 使用稳定错误码、Cursor Pagination、幂等 Key。

## 前端边界

- `api/client.ts`：认证、单飞刷新、超时/取消、错误映射、requestId、幂等。
- `api/endpoints`：按领域封装路径。
- `stores`：仅全局会话、用户、厨房、成员、通知、Feature Flag。
- `services`：认证、上传、分析；页面不直接拼接敏感请求。
- development/staging/production 由构建注入，production 强制 HTTPS 且禁止 localhost/dev-login/debug。

## 数据与一致性

- 业务写入和 Outbox 同一事务。
- Worker 使用事件 ID 幂等消费，指数退避并记录死信。
- Refresh Token 采用 Session + Hash + Rotation + 重用检测。
- 偏好采用显式状态机和 version 乐观锁。
- 上传先验证并重编码，再写私有对象；数据库只保存受控 key。
- RLS 作为纵深防御，不替代应用 Guard/Policy。

## 可观测性

- 结构化日志带 requestId、userId（可脱敏）、kitchenId、route、latency、status。
- 指标覆盖 HTTP、数据库、Redis、AI、上传、Outbox backlog/失败。
- `/health/live` 与 `/health/ready` 分离，Ready 检查 PostgreSQL、Redis 和必要配置。
- 日志禁止 Token、微信 code/session_key、情书正文和完整私密 Prompt。

## 风险、迁移与回滚

| 项目 | 风险 | 迁移影响 | 回滚 |
|---|---|---|---|
| v2 API | 契约漂移 | 新路由/契约包 | v1 保持可用，前端 Feature Flag 回切 |
| Outbox | 重复消费 | 新表与 Worker | 停 Worker；业务仍保留 Outbox |
| RLS | 错误拒绝合法请求 | 策略与事务上下文 | 分阶段启用，紧急关闭策略 |
| COS | 迁移图片失败 | 对象复制与 storageDriver | 双读期回切 Local |
| Token Session | 用户被登出 | RefreshToken 回填 | 兼容旧 RefreshToken 至截止日 |

## 验收

- `pnpm test:e2e`、`pnpm test:security`、`pnpm test:coverage`、`pnpm build` 全部通过。
- 两个厨房的所有私密资源跨租户测试通过。
- Staging Migration、备份恢复、Smoke 和 UAT 有真实记录。

## 当前与目标清单引用

- 当前 v1 路由与权限：[api-inventory.md](api-inventory.md)
- 当前模型与约束：[database-inventory.md](database-inventory.md)
- 当前小程序：[frontend-inventory.md](frontend-inventory.md)
