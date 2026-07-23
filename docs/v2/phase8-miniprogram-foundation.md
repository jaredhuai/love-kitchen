# Phase 8：小程序 2.0 基础架构完成记录

完成日期：2026-07-20。

## 交付

- 环境由微信版本与构建注入共同选择；production 强制 HTTPS，并拒绝本地、示例、开发路径和 dev-login。
- 请求层保留 v1 页面兼容，同时提供显式 v2 Client；错误码稳定，401 刷新单飞，底层任务可真实取消，仅 GET 最多安全重试两次。
- 上传与下载暴露进度和取消控制；Contracts 覆盖会话、用户、厨房、成员、通知和 Cursor。
- Auth、User、Kitchen、Membership、Notification、FeatureFlag Store 完整注册，认证失败或换账号可一次清空。
- 路由 Smoke 验证 Tab 均属于主包，主包与分包路由不重复。

## 验收证据

- Env：6/6。
- Request：3/3；覆盖真实 abort、并发 401 仅刷新一次、GET 重试而 POST 不重试。
- Route：2/2。
- 小程序 TypeScript typecheck/build 与 `git diff --check` 通过。

## 兼容与回滚

未显式带 `/v1` 或 `/v2` 的旧路径自动落到 v1，因此现有页面不需同步切换。回滚可恢复旧请求层；服务端会话与数据不受影响。生产环境配置采用失败关闭，正式构建必须注入真实 HTTPS API 地址。
