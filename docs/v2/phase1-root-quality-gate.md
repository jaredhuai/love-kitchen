# Phase 1：根级质量门完成记录

日期：2026-07-12。范围为执行顺序第九项；通过后才允许进入 API v2 与模块化。

## 完成内容

- 根新增 `quality:prepare`、`test:security`、`test:coverage`、`test:migration`；原有 lint/typecheck/test/e2e/build 保留并真实执行所有 workspace。
- 删除无法按规范识别且只测单 Controller 的 `http.e2e-spec.ts`；真实 HTTP AppModule 测试保留为 `http.spec.ts`。
- miniprogram 与 shared-types 的测试从 `process.exit(0)` 改为真实 TypeScript 编译检查；validation 继续运行 Vitest。
- Migration 门先执行 Prisma validate/deploy，再精确验证四个 Migration 的成功记录和 Phase 1 关键表/列。
- 覆盖率用 V8 硬失败：分层行覆盖 Domain≥90、Security≥90、Application modules≥80；全局 lines/statements≥75、branches≥70、functions≥50。
- 覆盖率补测暴露并修复 RefreshToken jti 非 UUID 的既有缺陷，改用 `randomUUID()`；新增 8 项 Auth 单测覆盖生产禁 dev-login、刷新轮换和微信错误映射。

## 最终结果

- 根 `pnpm lint`、`pnpm typecheck`、`pnpm build`：通过。
- 根 `pnpm test`：API 66/66、Worker 5/5、validation 2/2，小程序/shared-types 编译测试通过。
- 根 `pnpm test:e2e`：32/32。
- 根 `pnpm test:security`：IDOR 6、偏好 6、上传 8、AI 11、Outbox 5、情书 8，全部通过。
- 根 `pnpm test:migration`：2/2；四个 Migration 无 pending/rollback。
- 根 `pnpm test:coverage`：全局 lines/statements 81.84%、branches 70.93%、functions 56.36%；Domain lines 100%、Security 95.57%、Application 80.29%。

## 风险

- 覆盖率的 90/90/80/75 分层指标定义为行覆盖；函数和分支另设符合当前基线的硬阈值。后续只允许提高，不得为过门而降低。
- 测试依赖专用 PostgreSQL 与 Redis；本地默认连接仅用于 `love_kitchen_test`/Redis DB 15，CI 应提供物理隔离服务。
- Migration 契约精确列举当前四个 Migration；新增 Migration 必须同步更新契约测试，否则门禁会失败。
- Prisma 6 提示 package.json prisma seed 配置将于 Prisma 7 废弃；升级前迁移到 prisma.config.ts。
- 当前 Node 环境高于项目建议的 Node 20 LTS；CI/CD 阶段必须使用锁定的 Node 20 镜像复跑。

## 回滚方案

1. 质量门脚本和配置可单独回退排障，但禁止恢复 skip、`process.exit(0)` 或删除阈值后宣称通过。
2. 覆盖率 Provider 故障时固定兼容版本修复；不得用关闭 coverage 作为长期降级。
3. Migration 测试失败时停止发布并 Roll-forward 修复 Schema/Migration，不得指向开发库或清空数据库。
4. RefreshToken UUID 修复无需 Migration，回滚会重新触发 PostgreSQL 500，禁止回退该行；后续 M2 会正式升级会话模型。
