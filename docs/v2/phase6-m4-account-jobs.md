# Phase 6：M4 数据导出与账号注销 Job 完成记录

日期：2026-07-20。对应剩余执行计划任务 6。

## 数据导出

- DataExportJob 以 `(userId, requestKey)` 唯一，重复请求返回同一 Job；状态覆盖处理、完成、失败、重试和过期。
- 导出采用字段白名单：本人 Profile、ACTIVE 厨房 Membership、共同菜品/用餐记录、仅本人的偏好提交与 AI 会话、本人收发情书的非密文元数据、本人上传的非存储定位元数据。
- 不查询或输出 Refresh Token/Session、微信 openId/unionId、情书 encryptedContent/keyVersion、恢复凭证哈希、对象 storageKey/thumbnailKey或伴侣偏好提交。
- 失败只记录异常类型，不记录私密正文；FAILED Job 可重试。结果 7 天后读取即转 EXPIRED 并清空 result。

## 注销状态机

- 请求先生成 dry-run，列出受影响厨房、原 ACTIVE Membership 和 OWNER 数量；永久清除始终为 false。
- 用户进入 DELETION_PENDING，并在同一事务撤销全部 legacy/new Refresh Token；现有短期 Access Token 仅允许冷静期内查询/取消/到期执行，不能重新登录或刷新。
- 冷静期默认 7 天、可配置 1–30 天；提前执行稳定返回 ACCOUNT_COOLING_OFF，取消恢复 ACTIVE。
- 到期执行使用 Serializable 事务和冲突重试，只把 User 标记 DEACTIVATED、Membership 标记 LEFT，并再次撤销会话；业务数据不删除。
- 恢复凭证只在请求响应中返回，数据库只存 SHA-256。已逻辑停用用户可通过公开但受全局限流保护的恢复端点恢复 User 和 dry-run 记录的原 ACTIVE Membership。
- `ACCOUNT_PERMANENT_PURGE_ENABLED` 配置只接受字符串 `false`；任务 12 恢复演练签字前无法启用物理清除。

## 验收证据

- 真实 AppModule/PostgreSQL Job E2E 4/4：导出幂等/越权、字段与伴侣隐私隔离、安全失败重试、冷静期、取消、逻辑停用、认证阻断、错误/正确恢复凭证和 Membership 恢复。
- Migration 6/6；八个仓库 Migration 全部成功部署。
- 完整 API 回归 23 files / 109 tests；Typecheck 通过。

## 回滚

1. 停止新 Job 请求和到期执行；保留 User 状态、Job、dry-run 和业务数据。
2. 错误逻辑停用通过恢复凭证或受审计的运维 Roll-forward 恢复 User/Membership，禁止删除 Job 伪造未发生。
3. 应用回滚保留新增表与 User 状态列；旧版本不能识别 DEACTIVATED 时不得直接上线，必须继续使用含状态检查的认证守卫。
