# 2.0 安全修复计划

## 顺序

严格执行：IDOR → 偏好状态机 → 真实 E2E → 上传 → AI Provider → Outbox → 情书测试 → 根质量门。

## 修复矩阵

| 问题 | 状态 | 风险 | 相关文件 | 修复 | 迁移影响 | 回滚 | 验收 | 测试 |
|---|---|---|---|---|---|---|---|---|
| 菜单关联 IDOR | 已完成（2026-07-11） | 严重→已缓解 | `meal-plans.ts`、`kitchen-resource.policy.ts` | Dish/Plan/User 使用 `id+kitchenId`，验证与写入同事务 | 无 Migration；后续可增复合索引 | 回退本项提交（不推荐放宽权限） | `pnpm test:idor` 6/6 | A 不能关联 B 菜品/用户/菜单 |
| 偏好竞态 | 已完成 | 严重 | `preferences-nutrition.ts`、Schema | 显式状态机、version、Serializable 事务转换 | M1 已执行 | Roll-forward 修正 state | `pnpm test:preferences` | 并发提交/揭晓、READY/REVEALED/CLOSED 只读 |
| E2E 跳过 | 已完成（2026-07-12） | 严重→已缓解 | `http.spec.ts`、`postgres.spec.ts`、安全 E2E | 默认真实 AppModule、独立 DB/Redis、作用域清理 Seed | 测试环境；自动 deploy Migration | 回退测试编排，不回退安全测试 | `pnpm test:e2e` 16/16 | Guard/Filter/Interceptor/Prisma/Redis 全链路 |
| 上传绕过 | 已完成（2026-07-20） | 高→已缓解 | uploads、storage | 三元格式校验、Sharp 重编码/缩略图、持久 checksum、Local/COS 双读与私有访问 | M5 已完成 | `UPLOAD_DRIVER=local`；保留受保护代理 | Upload 专项 12/12 | 伪造/超限/跨厨房、完整性、旧文件、故障回退、清理 |
| AI 非法输出 | 已完成（2026-07-12） | 高→已缓解 | `infra/ai/*`、`ai.ts` | Provider Token、Zod、一次修复、稳定错误、Mock | 无 Migration | 移除 Provider 绑定/关闭 AI 路由 | `pnpm test:ai-security` 11/11 | JSON/Schema/二次失败/429/5xx/超时/不落库/租户 Prompt |
| 审计非原子 | 已完成（2026-07-20） | 高→已缓解 | `enqueue-audit.ts`、`apps/worker` | 高风险业务+Outbox 同事务，Worker 幂等且生产治理完成 | M3 已完成 | 停 Worker/清理；保留 backlog | `pnpm test:outbox` 10/10 | 原子回滚、SKIP LOCKED、lease、重试/死信、防重入、停机、指标、脱敏 |
| 情书密钥/解锁 | 已完成（2026-07-12） | 高→已缓解 | `love-letters.ts`、crypto | keyVersion、收件人 Policy、事务 Outbox、四类真实测试 | M5 情书部分已执行 | 保留 V1 key 与旧列 | `pnpm test:letters` 8/8 | 密文不出 API、四条件、未知版本、跨厨房读/收件人 |
| Token 会话 | 已完成（2026-07-20） | 高→已缓解 | `modules/auth/*`、RefreshTokenSession | code2Session 超时、hash-only 双写、Serializable Rotation、family 重用撤销、当前/全部登出、SecurityEvent | M2 已执行；旧表兼容 | 保留旧 Token 兼容期 | `pnpm test:auth-session` 14/14 | 超时、并发 Rotation、重用、登出、生产禁 dev、脱敏 |
| 根质量门假绿 | 已完成（2026-07-12） | 严重→已缓解 | 根 scripts、Vitest、各 workspace | 真实 E2E/security/coverage/migration；无 exit-0 测试 | 测试环境 | 单项回退但禁止恢复 skip/空脚本 | 根完整命令链 | 66 API、5 Worker、2 validation、32 E2E、覆盖率、Migration |

## 通用控制

- DTO 白名单和字段长度；关联 ID 不信任客户端。
- 跨厨房返回统一 404/403，不泄露存在性。
- 限流 key 使用规范化 route、用户/IP 和用途；邀请/登录/AI 单独额度。
- Swagger 生产受认证保护或关闭。
- Secret Scan、依赖审计、SBOM 和镜像扫描进入 CI。
- 高风险写操作支持 Idempotency-Key。

## 审计脱敏

禁止记录 Token、refresh token、微信 code/openid/session_key、密钥、情书正文、完整 AI Prompt、上传原始私密内容。只保存动作、资源 ID、主体、租户、结果、requestId 和必要安全上下文。

## 回滚要求

- 每项单独分支/PR，具备 Feature Flag 或兼容路径。
- 数据变更优先 Roll-forward，不执行破坏性回退。
- 修复失败时保持 v1 数据可读，不放宽权限绕过问题。
