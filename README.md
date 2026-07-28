# 德德与桐桐厨房

> 和你做饭的日子就是幸福的时刻。
> 给德德和桐桐使用的私密双人厨房微信小程序。

## 项目简介

“德德与桐桐厨房”是一个只供两位已绑定微信用户使用的私密小程序：管理线上菜品库、安排今天或未来的早餐/午餐/晚餐/夜宵、评价完成的菜品，并保留两个人一起做饭的温馨记录。业务数据与图片均由线上 API 管理，不以手机本地存储作为数据源。

当前项目包含：

- 微信小程序前端：`apps/miniprogram`
- NestJS API 服务：`apps/api`
- 后台 Worker：`apps/worker`
- Prisma / PostgreSQL 数据模型与迁移
- Redis、上传代理、AI、情书、通知、统计等配套模块

## 当前小程序功能

底部导航当前为：

1. 首页：今日菜单、完成/取消餐次、线上温馨记录；今日菜单只显示菜品图片和名称，不展示描述、食材清单或步骤
2. 菜单：两列正方形菜品卡片，可选择今天、明天或一年内的自定义日期，安排早餐/午餐/晚餐/夜宵；下方展示未来餐单并支持取消安排
3. 评价：显示当天已完成菜品，可星级评分、填写文字评价并查看历史评价
4. 统计：最近七天摘要、常吃菜品及全部线上完成/取消记录；历史按年月日分组，新记录在前，日期可折叠
5. 我们的：菜品管理和爱情时间轴；故事支持自定义标题、新增和删除

菜品管理支持：

- 新增、编辑、删除菜品
- 上传菜品图片
- 维护菜品名称、描述、分类、人数、食材清单、步骤
- 分类预设：热菜、凉菜、汤羹、主食、小吃、家常菜、泡酱腌菜、西餐、烘焙、烤箱菜、饮品、零食、火锅、海鲜、自制食材
- 添加人固定为：德德、桐桐

显示规则：

- 首页今日菜单：只展示菜品图片、菜名、完成/取消按钮。
- 菜品详情页：展示菜品描述、添加人、食材清单、步骤和评价。
- 评价页：展示当天已完成菜品，可选择星级并补充文字评价。

界面风格：

- 使用暖白、粉色、淡紫色和可可色的双人厨房配色。
- 底部导航与功能入口使用 C 套手绘图标，其中“我们的”使用德德与桐桐的定制情侣头像。
- 按钮使用 B 套手绘线框 UI，包括爱心装饰、错位阴影和按压反馈。
- 标题与重点文案使用楷体/手写字体栈，正文与表单保留系统字体以保证可读性。

## 目录结构

```text
apps/
  api/          后端 API 服务
  miniprogram/  微信小程序
  worker/       后台任务与事件消费者
packages/
  api-contracts/
  shared-types/
  validation/
docs/           架构、隐私、安全、v2 设计与阶段文档
```

## 本地启动

准备环境：

- Node.js 20+
- pnpm 9
- Docker
- 微信开发者工具

初始化：

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

启动 API：

```bash
pnpm dev
```

微信开发者工具导入：

```text
apps/miniprogram
```

本地 API 默认地址：

```text
http://localhost:3000/api
```

## 小程序预览配置

开发时如果需要让手机扫码访问本机 API，可临时写入运行时配置：

```bash
pnpm --filter @love-kitchen/miniprogram runtime:configure -- --environment=development --api-base-url=http://你的局域网IP:3000/api
```

生成预览后请恢复：

```bash
pnpm --filter @love-kitchen/miniprogram runtime:reset
```

运行时配置文件为：

```text
apps/miniprogram/miniprogram/config/runtime.config.ts
```

该文件用于本地预览注入，不应保留真实生产地址。

## 常用检查命令

根项目：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

只检查小程序：

```bash
pnpm --filter @love-kitchen/miniprogram typecheck
pnpm --filter @love-kitchen/miniprogram test
```

只检查后端：

```bash
pnpm --filter @love-kitchen/api typecheck
pnpm --filter @love-kitchen/api test
```

## 数据与隐私说明

- 项目以 `kitchenId` 隔离两人厨房数据。
- 私密资源由后端根据登录态和厨房成员关系校验。
- 上传图片通过受保护代理读取，不直接暴露本地文件路径。
- 本地开发上传目录 `uploads/`、预览二维码目录 `.codex-artifacts/`、日志文件和私有配置均已加入 `.gitignore`。
- 菜品、餐次、评价、故事、统计事件和温馨记录图片均保存在线上服务；更换手机或重新登录后可恢复。
- 手机端只持久化必要的登录会话凭证，不保存业务数据副本；页面运行期会在内存中暂存当前接口响应。
- 菜品描述中用于保存食材和步骤的结构化内容，不会在首页今日菜单卡片中展示。

## 真机预览

预览前请在本地微信开发者工具中配置自己的 AppID。每次功能修改后重新生成二维码，旧二维码不代表最新代码。当前二维码文件：

```text
.codex-artifacts/love-kitchen-future-copy-preview.png
```

## 当前交接

最新开发状态、已完成内容、待办事项和验证方式见：

```text
HANDOFF.md
```
