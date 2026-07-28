# HANDOFF：德德与桐桐的小厨房

更新时间：2026-07-28
当前阶段：V4 功能迭代与真机回归；生产 API、PostgreSQL 和上传文件服务正在运行。

## 1. 产品与身份规则

- 产品是仅供两人使用的微信原生小程序。
- 唯一厨房名为“德德与桐桐”。
- 只允许两位微信用户成为有效成员：
  - `OWNER` 在界面统一显示为“德德”。
  - `MEMBER` 在界面统一显示为“桐桐”。
  - 显示名必须依据 `KitchenMember.role`，不能依据微信昵称；微信新用户的数据库昵称可能仍是“微信用户”。
- 第三位用户应由服务器拒绝。
- 不使用创建厨房、选择厨房或邀请码流程。
- 登录入口已改为爱心按钮，不需要用户输入访问密码。
- 不得把微信 OpenID、用户 ID、密码、密钥或真实隐私数据写入仓库和本文档。

## 2. 小程序配置

- AppID：`wxde50b6673743cc72`。
- 生产 API Base URL：`https://lovekitchen.hzhlovezxt.com/api`。
- 本机运行配置：`apps/miniprogram/miniprogram/config/runtime.config.ts`。
- 项目配置：`apps/miniprogram/project.config.json`。
- 微信公众平台合法域名均为 `https://lovekitchen.hzhlovezxt.com`：
  - request
  - uploadFile
  - downloadFile
- 合法域名不要附带 `/api` 或末尾斜杠。
- `runtime.config.ts`、`project.config.json` 可能含本机专用改动，提交前必须单独审查。

## 3. 当前主要功能

底部导航：

1. 首页
2. 菜单
3. 评价
4. 统计
5. 我们的

### 首页

- 固定展示今日早餐、午餐、晚餐和夜宵，即使没有安排也显示“还没安排”。
- 支持完成或取消餐次，并将结果写入服务器。
- “今日的温暖记录”保存到服务器，另一位用户可以同步看到更新。
- 温暖记录显示添加者；角色映射为 OWNER=德德、MEMBER=桐桐。
- 温暖记录图片保存到服务器上传卷。
- 登录入口显示“今天是小厨房开业第 X 天”：
  - 开始日期为 2026-08-18。
  - 该日期之前统一显示第 0 天。

### 菜单与菜品

- 菜品分类固定为九类：
  - 荤菜
  - 素菜
  - 汤羹粥
  - 甜品零食
  - 西餐
  - 海鲜
  - 饮品
  - 主食
  - 其他
- “所有菜单”以 3×3 分类模块展示，模块内按分类读取菜品。
- 分类图标使用兼容微信本地资源的压缩 PNG：
  - 目录：`apps/miniprogram/miniprogram/assets/category-icons/`
  - 九张图片总计约 102KB，最大单张约 14KB。
  - 不要改回 WebP；当前微信开发者工具曾出现本地 WebP 空白。
- 菜单标题右侧有按菜名关键字搜索入口。
- 支持永久菜品和临时菜品：
  - 永久菜品长期保存。
  - 临时菜品绑定指定日期和餐次。
- 菜品支持多图上传，最多 9 张；第一张为封面，可调整顺序。
- 详情页点击图片使用原图预览，列表和普通展示使用缩略图。
- 菜品详情支持描述、食材、步骤、分类、人数和“我们的故事”。
- 新增/编辑页已经删除单独的“备注详情”文字输入模块。
- 备注详情图片上传入口仍位于“步骤”下方。
- 菜品描述输入框默认一行，输入多行内容后自动增高。
- 详情页不再生成左侧步骤序号；用户输入的原文（包括其自行输入的编号或 Emoji）照常显示。
- 菜品管理列表默认展示 5 个，其余折叠。
- “添加菜品”按钮提供永久/临时两个下拉选项。
- 菜品可加入今天、明天或自定义日期的早餐、午餐、晚餐、夜宵。
- 菜单页包含未来餐单并支持取消。

### 评价与统计

- 未评价菜品不伪造 `4.8（328）` 等默认评分，显示“暂无评价”。
- 支持真实星级、文字评价和评价历史。
- 统计页读取服务器饮食历史与取消事件。
- 日期按新到旧分组，可展开/折叠。

### 我们的 / 爱情时间轴

- 故事保存到 `/kitchens/:kitchenId/stories`。
- 支持添加、软删除故事。
- 每条故事显示添加者，按角色显示“德德”或“桐桐”。
- 另一位成员可以评论，评论同样按角色显示姓名。
- 支持按日历日期筛选故事。
- 菜品“我们的故事”编辑区位于人数模块下方，并随菜品新增/修改同步保存。

### AI 功能状态

- 小程序前端不展示 AI 厨师入口。
- 生产数据库中的 AI 历史表保留，不删除。
- 不要再次执行删除 AI 表的迁移。
- 仓库可能仍保留部分 AI 后端代码；当前产品要求是前端隐藏，不是物理删除历史数据。

## 4. 数据存储

- PostgreSQL 保存用户、厨房成员、菜品、餐次、评价、时间轴、故事和评论等业务数据。
- Docker `uploads_data` 卷保存上传图片。
- Redis 用于运行时数据，不作为业务数据的唯一来源。
- 小程序删除线上数据时会调用 API，数据库会同步更新或软删除，具体取决于对应模型。
- 不得清空生产数据库或上传卷。

## 5. 生产环境

- 系统：Ubuntu 24.04。
- 域名：`lovekitchen.hzhlovezxt.com`。
- API：`https://lovekitchen.hzhlovezxt.com/api`。
- 健康检查：`https://lovekitchen.hzhlovezxt.com/api/v1/health`。
- 部署目录：`/opt/love-kitchen/releases/current`。
- Compose 文件：`docker-compose.production.yml`。
- 环境文件：`.env.production`，不得提交到 Git。
- 服务：
  - NestJS API
  - PostgreSQL 16
  - Redis 7
  - Nginx HTTPS 反向代理
- PostgreSQL 与 Redis 不应暴露到公网。

常用更新命令：

```bash
cd /opt/love-kitchen/releases/current
git pull --ff-only origin main

sudo docker compose --env-file .env.production \
  -f docker-compose.production.yml \
  up -d --build api

curl -fsS https://lovekitchen.hzhlovezxt.com/api/v1/health
```

- 仅修改小程序 WXML/WXSS/TS 或图片资源时，不需要重启服务器。
- 修改 `apps/api/`、Prisma schema 或迁移时，需要更新并重建 API。
- Prisma 有迁移改动时必须先备份，并确认迁移文件确实已在服务器当前提交中。

## 6. 最近生产备份

2026-07-28 已在服务器完成并验证一次备份：

```text
/opt/love-kitchen/backups/20260728_203425/
```

包含：

- `database.dump`：PostgreSQL custom-format 备份。
- `uploads.tar.gz`：上传图片卷备份。
- `SHA256SUMS`：完整性校验。

验证结果：

- `database.dump: OK`
- `uploads.tar.gz: OK`

该备份目前位于同一台服务器。仍应复制一份到本地或其他存储位置，避免服务器磁盘故障导致生产数据和备份同时丢失。

## 7. 最近关键提交

截至本次 Handoff 更新前，`main` 与 `origin/main` 一致：

```text
236faff remove dish notes input
65261d1 fix category icons and simplify dish form
e606350 display couple names by kitchen role
bf00736 optimize miniprogram category assets
8fec7c4 fix temporary dish update validation
7d5719a refine story form and comment error
bc83331 keep today meal sections visible
03b0ec5 implement shared memories and timeline interactions
ccde255 preview original dish images
11787cc enable dish image preview
12177fe move dish notes images below steps
66f5268 clarify multi-image notes for all dishes
```

本次 Handoff 提交会位于 `236faff` 之后。

## 8. 当前验证状态

近期修改已执行：

```bash
node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit
node_modules/.bin/tsc -p apps/miniprogram/tsconfig.json --noEmit
git diff --check
```

已确认：

- 九张分类 PNG 均远小于 200KB。
- 分类 PNG 总计约 102KB。
- OWNER/MEMBER 显示名不依赖数据库昵称。
- 生产数据库和上传文件备份校验通过。

## 9. 当前已知待办

### 高优先级

1. 用户反馈：“添加菜品”按钮点击后没有反应。
   - WXML 仍绑定 `toggleAddMenu`。
   - TypeScript 中仍存在 `toggleAddMenu()` 和 `startAddDish()`。
   - 下拉菜单使用 `.add-menu-wrap { position: relative; z-index: 8 }`。
   - 尚未完成真机原因定位和修复。
   - 优先检查微信实际执行的 JS 是否为旧的生成文件，以及下拉菜单是否被相邻原生组件或层叠上下文遮挡。
2. 用户反馈：两位成员同时浏览或编辑时，偶发菜品加载失败，稍后自行恢复。
   - 2026-07-29 真机截图确认服务端返回 `429 请求过于频繁`。
   - 原限流按代理后的 IP + 路径共享 120 次/分钟，两位成员可能共同消耗同一额度。
   - 服务端已改为每个登录会话独立的路由额度（240 次/分钟），并保留 IP 总保护额度（1200 次/分钟）。
   - 限流会话标识只保存访问令牌的 SHA-256 截断摘要，不把令牌写入 Redis key。
   - 该服务端修复需要服务器拉取最新 `main` 并重新构建 API。
   - 已移除首页、评价页首次进入时 `onLoad` / `onShow` 的重复加载。
   - 页面加载增加进行中去重。
   - 菜品缩略图下载限制为最多 3 个并发。
   - GET 超时由 10 秒调整到 15 秒，失败重试改为指数退避并增加随机抖动。
   - 菜单的未来餐单接口失败时不再连带清空已成功加载的菜品。
   - 仍需两台真机同时操作进行回归；如继续出现，需要结合 API、Nginx、PostgreSQL 和容器日志定位服务端原因。
3. 修复后回归永久菜品、临时菜品、图片上传、保存和编辑。
4. 把服务器备份复制到服务器外。

### 发布前回归

- 两个微信号分别登录。
- OWNER 显示德德，MEMBER 显示桐桐。
- 今日温暖记录双方同步。
- 故事添加者、评论者姓名正确。
- 九个分类图标可见。
- 菜品搜索可用。
- 菜品新增、编辑、删除可用。
- 多图上传、缩略图、原图预览可用。
- 今日及未来餐次可添加与取消。
- 评价和统计数据正确。

## 10. 工作区注意事项

当前工作区可能仍包含不应随功能提交的本机文件：

- `.gitignore` 的用户改动。
- `apps/miniprogram/miniprogram/config/runtime.config.ts`。
- `apps/miniprogram/project.config.json`。
- TypeScript 编译产生的未跟踪 `.js` 文件。
- `体验版/`。

除非用户明确要求并完成审查，否则不要暂存这些文件。
不要执行 `git reset --hard`、批量清理或覆盖用户工作区。

## 11. 关键文件

- 交接：`HANDOFF.md`
- 生产部署：`Dockerfile.api`、`docker-compose.production.yml`
- Prisma：`apps/api/prisma/`
- 微信登录：`apps/api/src/modules/auth/`
- 身份显示：
  - `apps/api/src/modules/timeline/infrastructure/timeline.repository.ts`
  - `apps/api/src/modules/memories/application/memories.service.ts`
- 首页：`apps/miniprogram/miniprogram/pages/home/`
- 菜单：`apps/miniprogram/miniprogram/pages/meal-plan/`
- 菜品详情：`apps/miniprogram/miniprogram/pages/dishes/detail.*`
- 菜品管理与时间轴：`apps/miniprogram/miniprogram/pages/our/`
- 分类图标：`apps/miniprogram/miniprogram/assets/category-icons/`
- 小程序测试：`apps/miniprogram/test/`
