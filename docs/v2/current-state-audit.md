# 2.0 当前状态审计

初始审计日期：2026-07-11；当前状态更新：2026-07-18

当前阶段：Phase 3 准备。以下“Phase 0 基线”章节保留当日事实，不代表当前实现；最新完成状态以根目录 `HANDOFF.md` 和本文末尾阶段进展为准。

分支：`audit/v2-baseline`

## 结论

项目是可编译的 1.0 原型，不满足 2.0 生产上线门槛。现有 API、Prisma 模型和小程序页面可作为渐进迁移基础，不应推倒重写。Phase 1 必须先解决跨厨房关联、偏好并发状态、真实 E2E、上传、AI、可靠审计和情书安全测试。

## 仓库与工程基线

- pnpm Monorepo：`apps/api`、`apps/miniprogram`、`packages/shared-types`、`packages/validation`。
- 后端：NestJS、Prisma、PostgreSQL、Redis、JWT、Swagger、Vitest。
- 前端：原生微信小程序、TypeScript、WXML、WXSS。
- 数据库：只有一个初始 Migration，后续结构变化缺少独立、可回滚 Migration。
- Git：本次在真实项目目录初始化，分支为 `audit/v2-baseline`。
- `.env` 与 `apps/api/.env` 已由 `.gitignore` 排除；审计未输出其内容。
- 本地存在重复的根级 `pages/`、`components/` 与小程序目录内容，归属不清，Phase 1 前不得直接删除。

完整盘点：

- [API、Service、Guard 与路由清单](api-inventory.md)
- [数据库模型、索引、约束与关联清单](database-inventory.md)
- [小程序页面、组件、Store 与请求层清单](frontend-inventory.md)

## Phase 0 基线：当时已实现

- JWT Access/Refresh Token、Refresh Hash 与基础 Rotation。
- dev-login 生产环境禁用；微信 code2Session 有基础实现。
- KitchenAccessGuard、KitchenOwnerGuard 与多数厨房路由 Guard。
- 厨房创建、邀请、接受邀请及 Serializable 事务。
- 菜品 CRUD、点评 Upsert、库存、购物、菜单、偏好、营养、AI、上传、故事、时间轴、纪念日、成就和情书的基础接口。
- AI 推荐输出已使用 Zod 校验，模型名来自配置。
- 上传具有 Multer 大小限制、扩展名与基础魔数检查。
- 情书使用 AES-256-GCM 领域函数，DATE/DISH_COUNT/MEAL_COUNT/MANUAL 有基础判断。
- 小程序具备环境配置、基础 Auth/Kitchen Store、单飞刷新与若干页面。

## Phase 0 基线：当时部分实现

| 问题 | 当前状态 | 风险 | 相关文件 | 修改方案 | 数据迁移影响 | 回滚方案 | 验收命令 | 对应测试 |
|---|---|---|---|---|---|---|---|---|
| 多租户隔离 | 主资源多带 `kitchenId`，但菜单关联 ID 未全部校验 | 严重 | `apps/api/src/modules/meal-plans.ts` | 关联验证与写入同事务；统一 Resource Policy | 无或增加复合索引 | 回退单模块提交 | `pnpm test:security` | 跨厨房菜单、日志、分工 E2E |
| 偏好揭晓 | 用 `revealedAt` 隐式表示状态，检查与写入分离 | 高 | `preferences-nutrition.ts`、Prisma Schema | 增加 OPEN/READY/REVEALED/CLOSED 与乐观锁 | 新枚举、state/version 回填 | Roll-forward 恢复默认 OPEN | `pnpm test:e2e` | 并发提交、并发揭晓、揭晓后只读 |
| AI | Zod 已有；无 Provider、一次修复、稳定错误码和完整 Mock | 高 | `modules/ai.ts` | Provider/Orchestrator、一次修复、超时与错误映射 | 可选用量表 | Feature Flag 回退 AI | `pnpm test:security` | 非 JSON、Schema、429、5xx、超时 |
| 上传 | 本地适配器、大小/魔数已有；无 COS、严格对应、重编码与删除 | 高 | `modules/uploads.ts`、`infra/storage/*` | Adapter Token、Local/COS、签名 URL、重编码 | UploadFile 补状态/校验字段 | 切回 Local Adapter | `pnpm test:security` | MIME、扩展名、双扩展、跨厨房 |
| 审计 | 事后同步写 AuditLog，不吞错但不与业务同事务 | 高 | `common/audit.interceptor.ts` | Outbox 与业务同事务，Worker 幂等消费 | 新增 OutboxEvent | 保留旧 AuditLog，只停 Worker | `pnpm test:e2e` | 业务/Outbox 原子性、重试、脱敏 |
| 情书 | 四种条件基础判断已存在，无密钥版本/轮换/Worker | 高 | `modules/love-letters.ts`、`domain/letter-crypto.ts` | 增加 keyVersion、状态策略、Worker 与安全测试 | LoveLetter 增 keyVersion | 兼容当前密钥版本 1 | `pnpm test:security` | 四种解锁、错密钥、跨厨房、接收者 |
| 微信登录 | code2Session 基础可用；无超时、身份拆分、登出和会话模型 | 高 | `modules/auth.ts`、User/RefreshToken | WechatIdentity、RefreshTokenSession、超时与撤销 | 新模型及回填 | 保留 v1 User 字段兼容期 | `pnpm test:security` | code、Rotation、重用、登出、生产禁 dev |
| 前端架构 | env、Store、请求层雏形；环境仍写死 development | 中 | `apps/miniprogram/miniprogram` | API client/endpoints/contracts、构建环境和完整 Store | 无 | Feature Flag 保留 v1 页面 | `pnpm --filter @love-kitchen/miniprogram test` | Store、刷新、路由、Smoke |
| API v2/错误/分页 | 只有 v1、message 型错误、Offset 分页 | 高 | `main.ts`、Filter/Interceptor、列表模块 | v1 兼容下增加 v2 契约、稳定 code、Cursor | IdempotencyKey 等新模型 | Feature Flag 回 v1 | Contract+E2E | v1兼容、v2响应、Cursor边界 |
| 生产入口 | 未启用 CORS 配置，无可信代理/网关/请求体统一上限；Swagger 无生产保护 | 高 | `main.ts`、部署目录（缺失） | 明确 CORS allowlist、proxy、TLS gateway、Swagger保护 | 无 | 回退网关配置 | Staging Smoke/Security | 跨域、Header、Swagger鉴权、大小限制 |
| 可观测性 | requestId 基础存在；无结构化日志、指标、告警、live/ready | 高 | common、health、部署（缺失） | 结构化脱敏日志、指标、分离健康检查与告警 | 可选事件表 | 关闭 exporter | Smoke/监控检查 | 日志脱敏、DB/Redis ready、故障告警 |
| 合规/删除 | 无协议授权、账号注销、厨房删除、导出 Job | 高 | 前后端及 Prisma | 冷静期 Job、二次确认、保留/恢复策略 | 新 Job/状态字段 | 暂停 Job，不删除数据 | E2E+恢复演练 | 注销权限、冷静期、幂等、恢复 |
| CI/CD与供应链 | 无 workflow、SBOM、secret/dependency/migration scan | 高 | `.github`/infrastructure（缺失） | PR/Main 流水线与不可变镜像 | 无 | 停部署 workflow | CI 全套命令 | 故意失败门、secret fixture、migration validation |
| 备份/恢复 | 无 PITR、COS版本、RPO/RTO与演练 | 严重 | 运维文档/脚本（缺失） | 托管备份、PITR、恢复脚本和演练证据 | 无业务 Schema | 不适用；先验证再上线 | Restore Drill | 抽样恢复与一致性检查 |
| 重复目录/私有配置 | 根级 pages/components 疑似副本；private config 被初始提交 | 中 | 根目录、miniprogram | 暂不删副本；停止跟踪本地私有配置，Phase 8 引用检查后清理 | 无 | 恢复索引项 | Git/构建检查 | 构建引用、路由 Smoke |

## Phase 0 基线：当时未实现

- Phase 0 文档体系（本次补齐）之外的正式 v2 API 和契约包。
- Cursor Pagination、后端 IdempotencyKey、稳定错误码。
- WechatIdentity、RefreshTokenSession、OutboxEvent、SecurityEvent、导出/注销 Job。
- Worker、可靠通知、后台重试与死信。
- COS 私有桶与签名 URL。
- 默认运行的真实 AppModule E2E 和 Security Suite。
- CI/CD、SBOM、Secret Scan、Dependency Audit、Migration Validation。
- Staging、生产部署、监控、告警、备份、PITR 与恢复演练。
- 用户协议、隐私授权、账号注销、厨房删除完整流程。

## Phase 0 基线：当时高风险细节

1. `MealPlan` 创建/更新未验证 `dishId` 和 `cookUserId` 属于当前厨房；MealLog 和 CookingAssignment 同类。
2. 偏好提交先检查 `revealedAt` 再 Upsert，存在并发竞态；Schema 无显式状态机。
3. `AuditInterceptor` 在业务提交后写审计，审计失败时业务已成功但响应失败，重试可能重复写。
4. `http.spec.ts`、`postgres.spec.ts` 默认跳过；另一个 HTTP 测试只加载 HealthController。
5. 上传未严格绑定 MIME/扩展名/魔数，缺少 COS、重编码、删除和孤立文件清理。
6. Refresh Token Rotation 未与新 Token 创建放在同一事务，无 Session/重用安全事件。
7. Swagger 生产环境无访问保护；前端 production/staging URL 是占位符。
8. `main.ts` 未显式启用 CORS；当前同源/非浏览器场景不等于已完成生产 allowlist。
9. 无 API Gateway/Nginx、可信代理、结构化日志、指标或告警配置。
10. 无备份/PITR/COS 版本控制和恢复演练，无法满足 RPO/RTO。
11. `apps/miniprogram/project.private.config.json` 是本地工具配置，Phase 0 补充提交将停止跟踪但保留本地文件。

## 数据迁移风险

- 只有一个体量较大的初始 Migration，无法证明后续 Schema 与数据库一致。
- 新状态机需要为历史偏好 Session 推导 state，错误回填可能暴露提交。
- WechatIdentity 拆分需保持 `wechatOpenId` 兼容并检查重复。
- Outbox 上线需避免业务双写和审计重复。
- LoveLetter keyVersion 回填必须默认指向当前密钥，禁止重新加密失败导致正文不可读。

## Phase 0 验收

- 文档：本目录五份文档及根目录 `HANDOFF.md`。
- Git：`audit/v2-baseline`，环境文件不被跟踪。
- 命令结果：在本文最后一次更新时补录；跳过的测试必须明确标记，不视为通过安全门。

## 基线命令结果

执行日期：2026-07-11。

| 命令 | 结果 | 说明 |
|---|---|---|
| `pnpm lint` | 通过 | 4 个 workspace 项目完成 |
| `pnpm typecheck` | 通过 | API、小程序、共享类型、验证包完成 |
| `pnpm test` | 部分通过 | API 15 通过、2 跳过；validation 2 通过；小程序和 shared-types 是空测试命令 |
| `pnpm build` | 通过 | 4 个 workspace 项目完成 |
| `pnpm --filter @love-kitchen/api test:http` | 通过 | 1 个真实 AppModule 健康接口测试；尚非完整业务 E2E |
| `pnpm --filter @love-kitchen/api test:postgres` | 阻塞/失败 | 环境没有名称包含 `test` 的独立 DATABASE_URL；测试安全拒绝使用开发数据库 |
| `pnpm test:e2e` | 不存在 | 根脚本缺失 |
| `pnpm test:security` | 不存在 | 根脚本缺失 |
| `pnpm test:coverage` | 不存在 | 根脚本缺失；API 子包虽有脚本但未配置门槛 |

Docker 中 PostgreSQL 16 与 Redis 7 状态为 healthy，但现有 PostgreSQL 实例是开发库，不能作为隔离测试库。Phase 1 必须建立独立测试数据库/Redis，并让默认质量门真实运行。

容器元数据显示当前运行实例由父目录 `/爱情厨房/docker-compose.yml` 创建，而 Git 仓库位于嵌套的 `/爱情厨房/love-kitchen`。Phase 1 建立测试环境时必须使用明确的 Compose project name、独立 test 数据卷和 test DATABASE_URL，不能复用现有开发卷。

显式 `test:http` 只验证一个 Health 路由；虽然加载 AppModule，但没有验证 JWT、KitchenAccessGuard、跨厨房、写操作、审计、限流或 Seed 隔离，因此不代表 E2E 门通过。

Phase 0 补充文档完成后于 2026-07-11 再次执行根级质量命令：lint、typecheck、build 通过；默认 test 仍为 API 15 通过/2 跳过、validation 2 通过，小程序与 shared-types 仍为空测试命令。结果与基线一致，两个跳过项继续作为 Phase 1 阻塞，不以文档补充掩盖。

## Phase 1 进展

- 2026-07-11：菜单、投票、分工和饮食记录关联 IDOR 已修复，真实 AppModule + `love_kitchen_test` E2E 6/6 通过。
- 根默认测试已发现并运行该 E2E；API 当前 21 通过、2 个旧测试跳过。
- 详细风险、兼容和回滚见 [`phase1-idor-remediation.md`](phase1-idor-remediation.md)。
- 真实数据库测试暴露 dev-login 的 RefreshToken jti 与 UUID 列不兼容，留待认证阶段处理。
- 2026-07-12：偏好 M1 状态迁移、Serializable 转换、version 条件更新及 close 只读终态完成；真实数据库并发/只读 E2E 6/6 通过，详见 [`phase1-preference-state-machine.md`](phase1-preference-state-machine.md)。
- 2026-07-12：默认真实 E2E 门完成，移除 HTTP/PostgreSQL 的两个 skip；`test:e2e` 自动执行 Migration，并以专用 PostgreSQL 数据库和 Redis DB 15 完成 16/16，详见 [`phase1-real-e2e.md`](phase1-real-e2e.md)。
- 2026-07-12：上传入口完成三元格式校验、像素限制、去元数据 WebP 重编码、私有 Local/COS Adapter、跨厨房读删防护和孤立清理；真实安全 E2E 8/8，详见 [`phase1-upload-security.md`](phase1-upload-security.md)。
- 2026-07-12：AI 业务与 SDK 解耦，DeepSeek/Mock Provider 完成 Zod 结构验证、一次修复和稳定错误映射；安全单测 11/11，非法结果不落库且 Prompt 仅含当前厨房数据，详见 [`phase1-ai-provider.md`](phase1-ai-provider.md)。
- 2026-07-12：移除事后 AuditInterceptor，M3 新增 OutboxEvent 和幂等 AuditLog 消费键；高风险业务事务内写事件，独立 Worker 完成并发抢占、重试和死信，真实 PostgreSQL 5/5，详见 [`phase1-outbox-audit.md`](phase1-outbox-audit.md)。
- 2026-07-12：情书 M5 keyVersion 完成；创建/列表不再返回密文，打开/手动解锁与 Outbox 同事务，四类条件和跨厨房/收件人安全 E2E 8/8，详见 [`phase1-love-letter-security.md`](phase1-love-letter-security.md)。
- 2026-07-12：根级质量门完成，新增真实 security/coverage/migration 命令并移除两个空测试脚本和错误命名的旧 HTTP 测试；正式根命令链全部通过，覆盖率与结果见 [`phase1-root-quality-gate.md`](phase1-root-quality-gate.md)。

## Phase 2 进展

- 2026-07-13：第十项开始按单模块迁移。菜品已拆分四层并提供 v2 Cursor/Contract/稳定错误/持久幂等；v1 路径保持兼容并发布 Sunset。真实 v1/v2 E2E 4/4、API 71/71、覆盖率门通过。其余模块和优先列表仍待逐个迁移，详见 [`phase2-dishes-v2.md`](phase2-dishes-v2.md)。
- 2026-07-18：第十项完成。全部业务域已迁入独立 Nest Module；五个优先列表完成 v2 Cursor/Contract，全部 v2 POST 使用持久 IdempotencyKey，稳定错误增加字段级 Validation details。幂等后续边界与最终质量证据见 [`phase2-completion.md`](phase2-completion.md)。

## Phase 3–4 进展

- 2026-07-20：M2 WechatIdentity、RefreshTokenSession、SecurityEvent Expand Migration 与可重入回填完成；旧身份/Token 兼容保留，Migration 4/4。详见 [`phase3-m2-identity-session-schema.md`](phase3-m2-identity-session-schema.md)。
- 2026-07-20：M3 Outbox/幂等生产治理完成；Worker 防轮询重入、优雅停机、过期键分批清理、lease/backlog/dead/年龄指标告警与安全事件消费边界均由真实 PostgreSQL/运行时测试 10/10 验证。详见 [`phase4-m3-outbox-governance.md`](phase4-m3-outbox-governance.md)。
- 2026-07-20：M5 上传生产元数据与存储治理完成；新增驱动/校验和/状态/缩略图字段、可重入历史回填、COS 配置阻断、Local/COS 双读故障回退及缩略图/完整性校验，专项 19/19。详见 [`phase5-m5-upload-storage.md`](phase5-m5-upload-storage.md)。
- 2026-07-20：M4 基础数据导出与账号注销 Job 完成；本人范围白名单导出、幂等/失败重试、dry-run、冷静期取消、逻辑停用、认证阻断和哈希能力恢复由真实 E2E 4/4 验证，永久物理清除保持关闭。详见 [`phase6-m4-account-jobs.md`](phase6-m4-account-jobs.md)。
- 2026-07-20：AI Orchestrator 完成；Redis 原子用户/厨房日配额、单飞并发、持久幂等、超时、可控降级、成本/延迟、失败不计量及响应保留清理由 AI 16/16、Worker 11/11 验证。详见 [`phase7-ai-orchestrator.md`](phase7-ai-orchestrator.md)。
- 2026-07-20：业务 Outbox Consumers 完成；通知、计数/日期情书解锁、成就和纪念日提醒支持收据/业务键幂等重放、跨厨房聚合校验、业务时区调度与死信恢复，Worker 15/15。详见 [`phase8-business-consumers.md`](phase8-business-consumers.md)。
- 2026-07-20：微信 code2Session Adapter 超时、身份切读、hash-only 双写、Serializable Rotation、family 重用检测、当前/全部登出和脱敏 SecurityEvent 完成；认证安全 14/14。详见 [`phase4-auth-sessions.md`](phase4-auth-sessions.md)。
