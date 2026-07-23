# 2.0 数据库迁移计划

## 原则

- 不修改或删除现有初始 Migration。
- 每个 Phase 创建独立 Migration，先 Expand、回填、验证，再 Contract。
- 生产只使用 `prisma migrate deploy`，不得执行 `migrate dev`。
- 每次变更包含前向脚本、回填、检查和 Roll-forward/回滚说明。

## 当前基线

- PostgreSQL Schema 含 40 个模型及 18 个业务枚举，完整清单见 [`database-inventory.md`](database-inventory.md)。
- 当前有 10 个 Migration：初始 Schema、M1 偏好、M3 Outbox、M5 情书 keyVersion、Phase 2 IdempotencyKey、M2 身份会话、M5 上传元数据、M4 合规 Job、AI 用量计量、业务 Consumer 幂等。
- 已有 Outbox/幂等、身份会话、安全事件、上传生产元数据、导出/注销 Job、AiUsageRecord 与 ConsumerReceipt；后续模型变更以剩余任务实际需求为准。

## 迁移批次

### M1：偏好状态机

状态：已在 `love_kitchen_test` 使用 `prisma migrate deploy` 执行并由并发 E2E 验证；生产/Staging 执行仍服从发布阶段审批。

- 新增 `MealPreferenceSessionState`、`state`、`version`、可选 `closedAt`。
- 回填：`revealedAt != null -> REVEALED`；否则按有效成员提交数推导 OPEN/READY。
- 检查：REVEALED 的两份 Submission 均有 `revealedAt`；OPEN 不得暴露对方 payload。
- 风险：错误推导导致答案泄露。回滚优先 Roll-forward 修正 state，不删除列。

### M2：身份与会话

状态：Expand Schema、兼容回填、应用双写/切读、事务 Rotation、登出和重用检测均已完成；旧字段/旧表保留至兼容窗口结束后再单独 Contract。

- 新增 WechatIdentity、RefreshTokenSession、SecurityEvent；SecurityEvent 的 Schema 所有权归 M2，M3 只负责后续消费与生产治理。
- 从 User.wechatOpenId 回填 WechatIdentity，并检查 `(appId, openId)` 唯一。
- 从现有 RefreshToken 迁移有效 Session；保留旧表兼容期。
- 风险：重复 openId、全员登出。回滚为继续接受旧 Token 至明确截止日。

### M3：Outbox 与幂等

进展：已完成。OutboxEvent、状态索引、AuditLog 消费唯一键和 IdempotencyKey 已部署；v2 写接口接入持久幂等；Worker 已具备过期键分批清理、可配置 lease、同进程防重入、批次上限、优雅停机，以及 backlog/processing/dead/最老事件年龄指标与阈值告警。SecurityEvent 由 M2 建模并明确不由审计 Consumer 消费。

- 保留已有 OutboxEvent、IdempotencyKey 及状态索引/唯一约束，新增清理和生产治理所需索引时使用独立 Expand Migration。
- v2 写面已逐模块切换；后续接口只按其明确幂等语义接入。
- 风险：双写重复、Worker backlog。回滚为停 Worker并保留事件。

### M4：合规任务

进展：已完成可恢复范围。新增 DataExportJob、AccountDeletionJob、UserStatus/deactivatedAt、导出保留期、冷静期、dry-run、失败重试和恢复凭证哈希；永久物理清除由配置 Schema 硬锁为 false，任务 12 恢复演练签字前无执行路径。

- 导出只选择本人资料、本人 ACTIVE 厨房共同业务数据和本人的私密提交/会话；不选择 Token、微信身份、密钥、情书密文或对象 storageKey。
- 注销先撤销 Refresh Session 并进入 DELETION_PENDING；冷静期可取消，到期后只逻辑停用用户和 Membership，数据不物理删除；哈希恢复凭证可恢复状态和原 ACTIVE Membership。
- 风险：误删除已通过 dry-run、冷静期和可恢复逻辑删除缓解。永久清除仍依赖任务 12 的备份恢复演练。

### M5：上传与情书

进展：已完成。LoveLetter.keyVersion 已回填为 1；UploadFile 已增加 storageDriver/checksum/status/thumbnailKey，历史记录以 LOCAL 默认兼容读取，并提供基于私有 Local 对象字节的可重入 checksum 回填。

- UploadFile 增 storageDriver、checksum、status、thumbnailKey。
- LoveLetter `keyVersion` 已完成，不在后续 Migration 重复修改。
- 风险：旧文件/密文不可读；采用双读和默认 keyVersion 回填。

## 每次 Migration 模板

1. 备份与快照标识。
2. `prisma migrate diff` 审阅 SQL。
3. 测试库执行 Migration。
4. 执行回填脚本（可重入）。
5. 执行一致性 SQL。
6. Staging 演练并记录耗时/锁。
7. 生产 `migrate deploy`。
8. 观察指标并决定继续或 Roll-forward。

## 验收与测试

- 新增 `pnpm test:migration`。
- 从 1.0 Seed 数据升级后记录数不减少。
- Migration 重复运行安全；回填脚本幂等。
- Staging 有执行、检查与恢复记录。
