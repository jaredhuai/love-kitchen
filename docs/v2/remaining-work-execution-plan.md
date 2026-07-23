# Love Kitchen 2.0 剩余工作执行计划

更新日期：2026-07-18。本文是 Phase 3–9 的执行顺序和验收索引；当前交接状态以根目录 [`HANDOFF.md`](../../HANDOFF.md) 为准。不得跨任务混合提交，不得以 mock、skip 或文档声明替代真实验收。

## 总体规则

1. 严格按任务编号执行；只有前一任务验收并提交后，下一任务才能进入 `IN_PROGRESS`。
2. 数据库变更采用 Expand → 回填 → 双读/兼容 → 验证 → 后续 Contract，生产数据只允许 Roll-forward。
3. 每项至少包含：设计/威胁模型、实现、Migration（如有）、测试、兼容与回滚、文档、独立提交。
4. 每项结束执行 `quality:prepare`、lint、typecheck、unit、相关 E2E/security、coverage、migration（如适用）和 build；Phase 门结束运行完整根质量链。
5. `HANDOFF.md` 是当前正式交接文件，更新重要状态时应同步维护。

## 执行状态

| 顺序 | 任务 | 当前状态 | 进入条件 | 完成证据 |
|---|---|---|---|---|
| 1 | Backlog 与审计文档校准 | DONE | Phase 2 完成 | 文档无当前状态冲突、交接范围清晰、链接检查 |
| 2 | M2 身份与会话 Schema | DONE | 任务 1 | Expand Migration、回填/检查脚本、Migration 测试 4/4 |
| 3 | 微信身份与安全会话 | DONE | M2 | code2Session 超时、原子 Rotation、登出/重用检测，安全测试 14/14 |
| 4 | M3 Outbox/幂等生产治理 | DONE | SecurityEvent 可用 | 分批清理、backlog/lease/dead/年龄指标、Integration 10/10 |
| 5 | M5 上传元数据与生产存储 | DONE | M3 稳定 | UploadFile Migration、缩略图、受控访问、Local/COS 双读，专项 19/19 |
| 6 | M4 导出与注销 Job | DONE | M2、恢复方案设计 | 本人导出/幂等、dry-run、冷静期、取消/逻辑停用/恢复，E2E 4/4 |
| 7 | AI Orchestrator | DONE | 会话/指标基础 | 原子配额、并发、成本、超时/降级、幂等，AI 16/16、Worker 11/11 |
| 8 | 业务 Outbox Consumers | DONE | M3、M4/M5 事件稳定 | 通知/情书/成就/提醒幂等重放、时区调度、跨租户失败关闭，Worker 15/15 |
| 9 | 小程序 2.0 基础架构 | DONE | v2/Auth/合规 API 稳定 | 生产阻断 6/6、Client/路由 5/5、typecheck/build |
| 10 | 小程序核心流程与合规 UI | IN_PROGRESS | 任务 9 | wx.login、隐私/协议/注销、核心页面、真机 UAT |
| 11 | 生产入口、可观测性与 CI/CD | TODO | 后端/前端质量门 | CI、镜像、CORS/Swagger、live/ready、日志/指标、Staging |
| 12 | 备份恢复与微信发布 | TODO | Staging 稳定 | PITR/对象恢复演练、RPO/RTO、回滚、上线材料与 UAT |

## 任务 1：Backlog 与审计文档校准

范围：把 Phase 0 历史快照和 2026-07-18 当前状态明确分开；消除 IdempotencyKey、Outbox、Worker、Local/COS、数据导出和 SecurityEvent 的重复或矛盾归属。

交付物：

- 更新交接文档：M3 改为生产治理，M5 改为上传元数据；已有基础不再描述为“未实现”。
- 更新当前状态、数据库迁移、前端清单和路线图；历史测试结果保留日期语境。
- 明确 SecurityEvent 由 M2 建模，M3 负责消费/治理；基础导出是 P0，高级导出格式是 P1。

验收：`rg` 检查当前状态冲突；Markdown 相对链接存在；`git diff --check`；仅文档变化。回滚为逆向本任务文档提交，不影响代码与数据库。

## 任务 2：M2 身份与会话 Schema

设计并新增 `WechatIdentity`、`RefreshTokenSession`、`SecurityEvent`。先审计重复 openId 和有效旧 RefreshToken，再创建 Expand Migration；回填必须可重入并输出计数检查，旧字段/旧表保留兼容期。

验收重点：`(appId, openId)` 唯一、Session 只存 token hash、family/rotation/撤销字段完整、安全事件不含 token/code/session_key；从 1.0 Seed 升级记录不减少；Migration 重跑安全。独立提交 Schema/Migration，再提交应用接入。

## 任务 3：微信身份与安全会话

实现带 AbortSignal/超时的 code2Session Adapter、错误映射和日志脱敏；把旧 Token 撤销、新 Token Session 创建和重用检测放在事务中；实现登出、全设备撤销和 SecurityEvent。生产继续禁止 dev-login。

验收重点：合法/非法/超时 code、重复身份、并发刷新、旧 token 重放、family revoke、登出、过期和兼容窗口 E2E。回滚只切回兼容读路径，不删除新 Session/SecurityEvent。

## 任务 4：M3 Outbox/幂等生产治理

保留已完成的 OutboxEvent、IdempotencyKey 和审计 Worker，新增过期幂等键清理、Outbox backlog/processing lease/dead-letter 指标、告警阈值和安全事件消费边界；防止同进程轮询重入并验证优雅停机。

验收重点：清理不删除未过期记录；Worker 并发、lease 恢复、重试/死信、停机和积压指标 Integration Test。回滚为停清理/Worker，保留所有事件。

## 任务 5：M5 上传元数据与生产存储

为 `UploadFile` 增加 `storageDriver`、`checksum`、`status`、`thumbnailKey`，历史记录按当前 Local 驱动安全回填；实现缩略图、生产 COS 配置验证、签名/受控访问和 Local/COS 双读。情书 `keyVersion` 已完成，不重复迁移。

验收重点：旧文件可读、checksum 一致、缩略图与原图同租户、删除/孤立清理、COS 故障回退 Local；Migration 与 Upload Security 全绿。

## 任务 6：M4 导出与注销 Job

新增 `DataExportJob`、`AccountDeletionJob` 和必要状态/保留期字段；先提供 dry-run、导出和冷静期取消，再实现可恢复的逻辑删除。永久清除开关在任务 12 恢复演练通过前保持关闭。

验收重点：只能操作本人/本人厨房授权范围；请求幂等；导出不含密钥/密文/他人超范围数据；冷静期、取消、失败重试和恢复 E2E。

## 任务 7：AI Orchestrator

在现有 Provider/Zod 基础上增加用户/厨房配额、并发限制、成本记录、超时、可控降级、请求保留与幂等协调；禁止用长数据库事务包裹外部 AI 请求。

验收重点：Mock、429/5xx/超时、配额竞争、失败不计成功用量、租户 Prompt 隔离、成本/延迟指标与 Feature Flag。

## 任务 8：业务 Outbox Consumers

按事件类型分别实现通知、情书解锁/提醒、成就和纪念日提醒 Consumer；每个 Consumer 使用事件 ID/业务唯一键幂等，支持重放、退避和死信，不把私密正文写日志。

验收重点：重复事件不重复通知/解锁；乱序和重放安全；跨厨房隔离；失败恢复和 dead-letter 运维路径。

## 任务 9：小程序 2.0 基础架构

使用构建注入选择 environment；production 强制 HTTPS 且拒绝 localhost/example.com/dev-login/debug。建立 v2 Client、稳定错误映射、真实 abort、单飞刷新、GET 安全重试、上传/下载进度、Contracts、Auth/User/Kitchen/Membership/Notification/FeatureFlag Stores。

验收重点：production build 阻断测试、Client/Store 单测、401 并发刷新、非幂等 POST 不自动重试、路由/分包 Smoke。

## 任务 10：小程序核心流程与合规 UI

接入 wx.login、隐私授权、用户协议、隐私政策、注销/冷静期；修复菜品、菜单、AI、“我们的”及库存购物主流程，移除占位和错误页面职责；按 Feature Flag 渐进切 v2。

验收重点：页面 loading/empty/error/retry 完整、Tab/分包导航正确、跨账号退出清理、核心 Smoke、隐私清单和真机 UAT。

## 任务 11：生产入口、可观测性与 CI/CD

增加 PR CI（lint/typecheck/unit/E2E/security/coverage/migration/secret/dependency/SBOM）、不可变镜像、手动审批部署；配置 CORS allowlist、可信代理、统一请求体限制、生产 Swagger 保护、`health/live`/`health/ready`、结构化脱敏日志、指标和告警；部署 Staging 并执行 Smoke。

验收重点：故意失败门能阻断；Secret fixture 被发现；Ready 在 DB/Redis 故障时失败；日志不含敏感字段；部署可 Roll-forward/回旧镜像。

## 任务 12：备份恢复与微信发布

启用 PostgreSQL PITR、对象版本/生命周期，编写并真实执行恢复演练；验证抽样数据库、上传和情书可读，记录 RPO≤24h、RTO≤4h。完成微信合法域名、HTTPS、隐私声明、真机 UAT、审核材料、发布监控和回滚 Runbook。

完成条件：Staging 恢复证据、生产变更审批、上线清单逐项签署；未完成恢复演练不得开启永久删除或宣称可上线。
