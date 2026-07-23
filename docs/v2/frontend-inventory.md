# 1.0 小程序前端清单

审计日期：2026-07-11。真实小程序根目录是 `apps/miniprogram/miniprogram`。

## 主包页面

| 页面 | app.json 注册 | 当前数据/API | 状态处理 | 主要缺口 |
|---|---|---|---|---|
| launch | 是 | Storage accessToken | 无错误 | 仅 token 存在判断；无安全会话恢复 |
| auth/login | 是 | dev-login | loading/toast | 无 wx.login、协议授权；生产环境仍展示 dev-login |
| onboarding | 是 | 无真实 API | 无 | 创建厨房/邀请码为占位跳转 |
| home | 是/Tab | meal-plans+dishes | loading 不完整 | 缺统一错误/骨架；本地回忆不持久化 |
| dishes/index | 是/Tab | dishes | loading/error/下拉 | WXML 未渲染菜品；无分页/搜索/导航 |
| dishes/detail | 是 | dish detail | loading/error | 模拟评分/故事；编辑 ID 路径；无删除/收藏/菜单 |
| dishes/edit | 是 | create/update/upload | saving/toast | 编辑原数据加载需核实；上传未绑定菜品/无进度 |
| add | 是/Tab | 无 | 无 | 仅中转页；替换了 Prompt 要求的 AI Tab |
| ai | 是但非 Tab | ai recommendations | loading/error | 首页使用 switchTab 导航失败；结果对象未组件化 |
| meal-plan | 是/Tab | 实际读取 dishes | loading/toast | 页面职责错误，删除菜品而非菜单；周视图缺失 |
| our | 是/Tab | stories+achievements | 无 loading/error | timeline/anniversary/letter/notification 缺失 |

## 分包/Feature 页面

| 页面 | 状态 | 主要缺口 |
|---|---|---|
| features/ai | 一行占位 | 与主包 AI 重复，归属不清 |
| features/meal-plan | 一行占位 | 与主包菜单重复 |
| features/pantry | 一行占位 | 无 API/交互/状态 |
| features/shopping | 一行占位 | 无 API/交互/状态 |
| features/timeline | 一行占位 | 无 API/交互/状态 |
| features/love-letters | 一行占位 | 无 API/解锁 UI/隐私状态 |
| features/profile | 一行占位 | 无资料/隐私/注销 |

## 组件、Store 与请求层

- 通用组件只有 `components/empty-state`，核心页面多数未使用。
- Store 只有 `auth.store.ts` 与 `kitchen.store.ts`；缺 user、membership、ui、notification、feature flags。
- `utils/session.ts` 将 Refresh Token 仅存内存，降低持久暴露但应用重启后无法刷新；需正式会话策略。
- `utils/request.ts` 有单飞刷新、requestId、超时 Promise 和幂等 Header；缺真实 abort、错误 code 映射、安全 GET 重试、上传/下载、进度、API v2。
- `config/env.ts` 写死 development，staging/production 是 example.com 占位符；无生产构建阻断。
- 小程序 `test` 已由 Phase 1 改为真实 TypeScript 编译检查，不再是 `process.exit(0)`；但仍没有 Store、Request 行为测试、页面 Smoke 或路由测试。

## 隐私与生产风险

- Access Token 持久化；Refresh Token 内存存储，需按正式 Session 威胁模型决定并测试。
- 未发现服务端 API Key/AppSecret 写入前端源码。
- development 使用 HTTP localhost，仅适合开发者工具；生产必须 HTTPS 合法域名。
- `project.private.config.json` 是开发者本地配置，不应跟踪；本轮 Phase 0 仅从 Git 索引移除，保留本地文件。
- 未实现首次隐私授权、用户协议、隐私政策、注销入口和健康免责声明的完整流程。

## 重复/孤立目录

- 仓库根级 `pages/` 和 `components/` 不属于 `apps/miniprogram/miniprogram`，疑似误生成副本。
- Phase 0 不删除；在 Phase 8 前建立引用检查，确认无构建/文档依赖后单独清理。

## 2.0 迁移与回滚

- 先建立 API Client/Contracts/Store，不一次改完所有页面。
- 页面按 Feature Flag 从 v1 迁移 v2；失败可逐页回切。
- 生产构建检查必须拒绝 localhost/example.com/dev-login/debug。
- 验收包含 Store/Request 单测、WXML 路由 Smoke、TabBar、真机 UAT。
