# Phase 4：微信身份与安全会话

日期：2026-07-20。范围为剩余工作任务 3。

## 实现

- `WechatCodeProvider` 将 code2Session 隔离为 Adapter，使用 `AbortController` 和 `WECHAT_LOGIN_TIMEOUT_MS`（默认 5000ms）；区分未配置、超时、网络/上游和无效 code 稳定错误。
- Provider 只返回 appId/openId/unionId，微信 `session_key` 不进入 Service、数据库、响应或日志。
- 微信登录以 `(appId, openId)` 查找 WechatIdentity；兼容旧 `User.wechatOpenId`，首次正式登录为旧用户补正式 appId 身份。
- Access/Refresh Token 签发与 legacy RefreshToken、RefreshTokenSession 双写在同一数据库事务；数据库只保存 SHA-256 hash。
- Refresh Token 带 `jti` 和 family `sid`。Rotation 在 Serializable 事务内原子撤销旧 Session、创建新 Session 和 rotation 链；有限重试事务冲突。
- 已旋转 Token 再次出现时视为重用：撤销整个 family，记录 HIGH `TOKEN_REUSED` SecurityEvent，并返回 `AUTH_REFRESH_TOKEN_REUSED`。
- 新增当前 Session 登出和全部 Session 登出；重复当前登出保持成功，避免客户端重试产生歧义。
- 微信登录失败记录受控原因 code 和 requestId，不保存一次性微信 code。

## API

- `POST /api/v1/auth/wechat-login`：支持可选 `deviceId`。
- `POST /api/v1/auth/refresh`：原子 Rotation，支持可选 `deviceId`。
- `POST /api/v1/auth/logout`：需要 Access Token 和当前 refreshToken，撤销当前 family。
- `POST /api/v1/auth/logout-all`：需要 Access Token，撤销用户全部活动 Session。

## 安全验证

- Auth 单元/Provider 与真实 AppModule/PostgreSQL：14/14，包括生产禁 dev-login、hash-only、配置缺失、网络失败、超时、非法响应、session_key 丢弃、身份落库、顺序/并发 Rotation、family revoke、当前/全部登出和失败事件脱敏。
- 完整质量门通过：quality prepare、lint、typecheck、build；workspace API 20 files / 96 tests；E2E 12 files / 57 tests；security 58/58；coverage 96/96（总行 85.83%、分支 78.09%、函数 68.42%）；Migration 4/4。
- 测试只使用专用 `love_kitchen_test` 与 Redis DB 15，微信 Provider 使用本地 Mock，不发送真实 code 或外部请求。

## 兼容与回滚

- 旧 User.wechatOpenId 和 RefreshToken 继续双写，兼容窗口内旧应用仍可读取；新应用对未回填的旧 Token 有兼容建 Session 路径。
- 回滚时保留 WechatIdentity、RefreshTokenSession、SecurityEvent 和 legacy 表；切回旧认证代码不会删除新会话数据。
- 不允许回滚到无 code2Session 超时、非事务 Rotation 或不检测 Token 重用的实现。
