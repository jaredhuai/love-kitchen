# 1.0 API、Service 与权限清单

审计日期：2026-07-11。全局前缀为 `/api/v1`；除 `@Public()` 外，所有路由先经过全局 `JwtAuthGuard`。带 `:kitchenId` 的私密 Controller 使用 `KitchenAccessGuard`；创建邀请额外使用 `KitchenOwnerGuard`。

Phase 2 完成：应用使用 URI Versioning，现有未标版本 Controller 默认保持 `/api/v1`；菜品、Timeline、Meal History、Notifications 和 AI Conversations 已新增 `/api/v2`，v1 Sunset 为 2027-12-31。所有业务域已进入独立 Nest Module，根级同名文件仅保留兼容导出。Swagger 分为 `/api/docs/v1` 和 `/api/docs/v2`。v2 三个 POST 均使用持久 IdempotencyKey，Notifications read PATCH 天然幂等，AI 付费写未在本阶段开放；完整范围见 [`phase2-completion.md`](phase2-completion.md)。

## 路由清单

| Method | 路径（省略 `/api/v1`） | Controller / Service | 权限 | DTO/输入 | 当前风险与 2.0 处理 |
|---|---|---|---|---|---|
| GET | `/health` | HealthController | Public | 无 | 仅浅健康；2.0 拆 live/ready |
| POST | `/auth/dev-login` | AuthController/AuthService | Public；生产代码内拒绝 | DevLoginDto | 前端仍固定 user-a；生产构建必须禁用 |
| POST | `/auth/wechat-login` | AuthController/AuthService/WechatCodeProvider | Public+全局限流 | WechatLoginDto | Abort 超时；按 appId+openId 身份；session_key 丢弃；失败 SecurityEvent 脱敏 |
| POST | `/auth/refresh` | AuthController/AuthService | Public | RefreshDto | Serializable Rotation；family 重用撤销；legacy 双写兼容 |
| POST | `/auth/logout` | AuthController/AuthService | JWT | RefreshDto | 当前 family 幂等撤销 |
| POST | `/auth/logout-all` | AuthController/AuthService | JWT | 无 | 撤销当前用户全部活动 Session |
| POST | `/kitchens` | KitchensController/KitchensService | JWT | CreateKitchenDto | 并发创建单厨房约束仅应用层；需事务/数据库防御 |
| POST | `/kitchens/:kitchenId/invites` | KitchensController/KitchensService | KitchenAccess+Owner | 路径参数 | 无撤销接口；审计非原子 |
| GET | `/invites/:token/preview` | KitchensController/KitchensService | Public | token | 需邀请专项限流和稳定错误码 |
| POST | `/invites/:token/accept` | KitchensController/KitchensService | JWT | token | Serializable 已有；缺并发真实 E2E/重试策略 |
| GET | `/kitchens/:kitchenId/dishes` | DishesController/DishesService | KitchenAccess | DishPageQueryDto | Offset 分页；v2 改 Cursor |
| GET | `/kitchens/:kitchenId/dishes/:dishId` | DishesController/DishesService | KitchenAccess | dishId | 查询包含 kitchenId；需真实跨厨房 E2E |
| POST | `/kitchens/:kitchenId/dishes` | DishesController/DishesService | KitchenAccess | DishDto | 食材/步骤/上传关联不完整；需幂等/Outbox |
| PATCH | `/kitchens/:kitchenId/dishes/:dishId` | DishesController/DishesService | KitchenAccess | UpdateDishDto | 原子更新含 kitchenId；缺 Policy/Outbox |
| DELETE | `/kitchens/:kitchenId/dishes/:dishId` | DishesController/DishesService | KitchenAccess | dishId | 软删除含 kitchenId；缺权限细分/Outbox |
| POST | `/kitchens/:kitchenId/dishes/:dishId/reviews` | DishesController/DishesService | KitchenAccess | ReviewDto | 先查菜品再 Upsert 非同事务；v2 用 Repository/Policy |
| GET v2 | `/kitchens/:kitchenId/dishes` | DishesV2Controller/DishesService/DishRepository | KitchenAccess | cursor+limit | `{items,pageInfo}`；createdAt+id 稳定 Cursor |
| GET v2 | `/kitchens/:kitchenId/dishes/:dishId` | DishesV2Controller/DishesService/DishRepository | KitchenAccess | dishId | 稳定 `RESOURCE_NOT_FOUND` |
| POST v2 | `/kitchens/:kitchenId/dishes` | DishesV2Controller/IdempotencyService/DishRepository | KitchenAccess | Idempotency-Key+DishDto | 业务+响应记录同 Serializable 事务；同请求重放/异请求409 |
| GET | `/kitchens/:kitchenId/pantry` | PantryController/PantryShoppingService | KitchenAccess | 无 | 无分页 |
| POST | `/kitchens/:kitchenId/pantry` | PantryController/PantryShoppingService | KitchenAccess | PantryDto | 缺幂等/Outbox |
| PATCH | `/kitchens/:kitchenId/pantry/:itemId/consume` | PantryController/PantryShoppingService | KitchenAccess | ConsumeDto | 原子扣减已有；需审计与并发 E2E |
| GET | `/kitchens/:kitchenId/shopping` | ShoppingController/PantryShoppingService | KitchenAccess | 无 | 无分页 |
| POST | `/kitchens/:kitchenId/shopping` | ShoppingController/PantryShoppingService | KitchenAccess | ShoppingDto | 缺幂等/Outbox |
| PATCH | `/kitchens/:kitchenId/shopping/:itemId/check` | ShoppingController/PantryShoppingService | KitchenAccess | itemId | 含 kitchenId；需真实 E2E |
| GET | `/kitchens/:kitchenId/love-letters` | LoveLettersController/LoveLettersService | KitchenAccess | 当前用户 | 仅发件人/收件人元数据；不返正文、密文或 keyVersion |
| POST | `/kitchens/:kitchenId/love-letters` | LoveLettersController/LoveLettersService | KitchenAccess | CreateLetterDto | 当前厨房另一 ACTIVE 成员；keyVersion+加密+Outbox 同事务；响应不返密文 |
| POST | `/kitchens/:kitchenId/love-letters/:letterId/unlock` | LoveLettersController/LoveLettersService | KitchenAccess；创建者条件 | letterId | 手动解锁；缺稳定状态机和审计事务 |
| GET | `/kitchens/:kitchenId/love-letters/:letterId/open` | LoveLettersController/LoveLettersService | KitchenAccess；接收者条件 | letterId | GET 修改 openedAt；v2 改 POST/Policy/Outbox |
| GET | `/kitchens/:kitchenId/stories` | StoriesController/MemoriesService | KitchenAccess | 无 | 无分页 |
| POST | `/kitchens/:kitchenId/stories` | StoriesController/MemoriesService | KitchenAccess | StoryDto | 缺上传关联/Outbox |
| DELETE | `/kitchens/:kitchenId/stories/:storyId` | StoriesController/MemoriesService | KitchenAccess | storyId | 返回 count 未统一 404 |
| GET | `/kitchens/:kitchenId/timeline` | TimelineController/TimelineService | KitchenAccess | 无 | v1 保持数组响应；系统/用户事件权限未分离 |
| POST | `/kitchens/:kitchenId/timeline` | TimelineController/TimelineService | KitchenAccess | TimelineDto | v1 保持非幂等写；任意成员可造任意 eventType，需 Policy |
| GET v2 | `/kitchens/:kitchenId/timeline` | TimelineV2Controller/TimelineService/TimelineRepository | KitchenAccess | cursor+limit | `{items,pageInfo}`；`eventDate+id` 稳定 Cursor |
| POST v2 | `/kitchens/:kitchenId/timeline` | TimelineV2Controller/IdempotencyService/TimelineRepository | KitchenAccess | Idempotency-Key+TimelineDto | 同请求重放，异 body 返回 409 |
| GET | `/kitchens/:kitchenId/anniversaries` | AnniversariesController/MemoriesService | KitchenAccess | 无 | 无分页 |
| POST | `/kitchens/:kitchenId/anniversaries` | AnniversariesController/MemoriesService | KitchenAccess | AnniversaryDto | 缺更新/删除/Outbox |
| GET | `/kitchens/:kitchenId/preferences` | PreferencesController/PreferencesNutritionService | KitchenAccess | PreferenceQuery | OPEN/READY 隐藏对方；REVEALED/CLOSED 可读 |
| POST | `/kitchens/:kitchenId/preferences` | PreferencesController/PreferencesNutritionService | KitchenAccess | PreferenceDto+Query | Serializable 提交；双方提交后原子进入 READY |
| POST | `/kitchens/:kitchenId/preferences/reveal` | PreferencesController/PreferencesNutritionService | KitchenAccess | PreferenceQuery | READY 原子进入 REVEALED；重复请求幂等读 |
| POST | `/kitchens/:kitchenId/preferences/close` | PreferencesController/PreferencesNutritionService | KitchenAccess | PreferenceQuery | REVEALED 原子进入 CLOSED；终态只读 |
| POST | `/kitchens/:kitchenId/nutrition/calculate` | NutritionController/PreferencesNutritionService | KitchenAccess | NutritionDto | 确定性计算；无食材库查询/免责声明契约 |
| GET | `/kitchens/:kitchenId/meal-plans` | MealPlansController/MealPlansService | KitchenAccess | `from` 字符串 | from 无 DTO 验证；无 Cursor |
| POST | `/kitchens/:kitchenId/meal-plans/groups` | MealPlansController/MealPlansService | KitchenAccess | PlanDto | Upsert；缺幂等/Outbox |
| POST | `/kitchens/:kitchenId/meal-plans` | MealPlansController/MealPlansService | KitchenAccess | MealDto | Phase 1 已用 Policy 在同事务验证 dishId/cookUserId |
| PATCH | `/kitchens/:kitchenId/meal-plans/:mealPlanId` | MealPlansController/MealPlansService | KitchenAccess | UpdateMealDto | Phase 1 已用运行时 DTO 与事务 Policy 验证关联 |
| DELETE | `/kitchens/:kitchenId/meal-plans/:mealPlanId` | MealPlansController/MealPlansService | KitchenAccess | mealPlanId | 本体含 kitchenId；硬删除需确认策略 |
| POST | `/kitchens/:kitchenId/meal-plans/:mealPlanId/votes` | MealPlansController/MealPlansService | KitchenAccess | VoteDto | Phase 1 已将 plan+kitchen 验证与 Upsert 放入同事务 |
| POST | `/kitchens/:kitchenId/cooking-assignment` | CookingAssignmentController/MealPlansService | KitchenAccess | AssignmentDto | Phase 1 已验证四个用户 ID 均为 ACTIVE 成员 |
| GET | `/kitchens/:kitchenId/meal-history` | MealHistoryController/MealHistoryService | KitchenAccess | 无 | v1 保持数组响应 |
| POST | `/kitchens/:kitchenId/meal-history` | MealHistoryController/MealHistoryService/MealHistoryRepository | KitchenAccess | MealLogDto | Phase 1 Policy 与事务 Outbox 保持 |
| GET v2 | `/kitchens/:kitchenId/meal-history` | MealHistoryV2Controller/MealHistoryService/MealHistoryRepository | KitchenAccess | cursor+limit | `{items,pageInfo}`；`eatenAt+id` 稳定 Cursor |
| POST v2 | `/kitchens/:kitchenId/meal-history` | MealHistoryV2Controller/IdempotencyService/MealHistoryRepository | KitchenAccess | Idempotency-Key+MealLogDto | MealLog+Outbox+幂等响应同事务 |
| GET | `/kitchens/:kitchenId/notifications` | NotificationController/NotificationService | KitchenAccess+当前用户 | 无 | v1 数组；不返回伴侣通知 |
| PATCH | `/kitchens/:kitchenId/notifications/:notificationId/read` | NotificationController/NotificationService | KitchenAccess+当前用户 | notificationId | `id+kitchenId+userId`；越权统一 404 |
| GET v2 | `/kitchens/:kitchenId/notifications` | NotificationV2Controller/NotificationService/NotificationRepository | KitchenAccess+当前用户 | cursor+limit | `{items,pageInfo}`；`createdAt+id` 稳定 Cursor |
| PATCH v2 | `/kitchens/:kitchenId/notifications/:notificationId/read` | NotificationV2Controller/NotificationService/NotificationRepository | KitchenAccess+当前用户 | notificationId | 天然幂等设置 readAt |
| POST | `/kitchens/:kitchenId/ai/recommendations` | AiController/AiService→Orchestrator→Provider | KitchenAccess | Idempotency-Key+RecommendationDto | 原子用户/厨房日配额、单飞并发、超时、可控本地降级、成本/延迟记录 |
| GET | `/kitchens/:kitchenId/ai/usage` | AiController/AiOrchestrator | KitchenAccess+当前用户 | 无 | 仅本人当前厨房请求数、状态、估算 Token/成本和平均延迟 |
| GET | `/kitchens/:kitchenId/ai/conversations` | AiController/AiService/AiRepository | KitchenAccess+当前用户 | 无 | v1 数组；不返回伴侣会话 |
| GET | `/kitchens/:kitchenId/ai/conversations/:conversationId` | AiController/AiService/AiRepository | KitchenAccess+当前用户 | conversationId | 返回自有会话消息；越权统一 404 |
| GET v2 | `/kitchens/:kitchenId/ai/conversations` | AiConversationsV2Controller/AiService/AiRepository | KitchenAccess+当前用户 | cursor+limit | `{items,pageInfo}`；`createdAt+id` 稳定 Cursor |
| GET v2 | `/kitchens/:kitchenId/ai/conversations/:conversationId` | AiConversationsV2Controller/AiService/AiRepository | KitchenAccess+当前用户 | conversationId | 稳定 `RESOURCE_NOT_FOUND` |
| POST | `/kitchens/:kitchenId/uploads` | UploadsController/UploadsService | KitchenAccess | multipart file | 10MiB/40MP；重编码 WebP+缩略图；持久 checksum/实际驱动；COS 可控回退 |
| GET | `/kitchens/:kitchenId/uploads/:fileId` | UploadsController/UploadsService | KitchenAccess | fileId | 私有代理、id+kitchenId、checksum 验证、Local/COS 双读；不存在统一 404 |
| GET | `/kitchens/:kitchenId/uploads/:fileId/thumbnail` | UploadsController/UploadsService | KitchenAccess | fileId | 私有缩略图代理、nosniff/no-store、同租户检查 |
| DELETE | `/kitchens/:kitchenId/uploads/:fileId` | UploadsController/UploadsService | KitchenAccess | fileId | 标记 DELETED 并删除原图/缩略图；重复/跨厨房统一 404 |
| POST | `/account/exports` | AccountController/AccountJobsService | JWT+用户 ACTIVE | Idempotency-Key | 本人授权范围白名单 JSON；同步完成 Job，失败可重试，7 天保留 |
| GET/POST | `/account/exports/:jobId[/retry]` | AccountController/AccountJobsService | JWT+userId | jobId | 越权 404；仅 FAILED 可重试；过期清空结果 |
| POST | `/account/deletion` | AccountController/AccountJobsService | JWT+用户 ACTIVE | Idempotency-Key | dry-run、冷静期、Refresh 全撤销；返回一次性恢复凭证 |
| GET/POST | `/account/deletion/:jobId[/cancel|/execute]` | AccountController/AccountJobsService | JWT+userId | jobId | 冷静期可取消；到期只逻辑停用；本人边界 |
| POST | `/account/deletion/:jobId/restore` | AccountController/AccountJobsService | Public+限流+恢复能力 | recoveryToken | 只比对 SHA-256 hash；恢复用户和原 ACTIVE Membership |
| GET | `/kitchens/:kitchenId/achievements` | AchievementsController/AchievementsService | KitchenAccess | 无 | 读取安全；无分页 |
| POST | `/kitchens/:kitchenId/achievements/evaluate` | AchievementsController/AchievementsService | KitchenAccess | 无 | 同步派生写；v2 移 Worker/Outbox |

## 全局组件清单

| 类型 | 名称 | 当前作用 | 2.0 缺口 |
|---|---|---|---|
| Guard | JwtAuthGuard | 全局验证 Access Token，Public 元数据跳过 | 无 Session/Permission/Policy/稳定错误码 |
| Guard | KitchenAccessGuard | 验证 ACTIVE Membership，注入 kitchen/membership | 每请求查库；无 ResourceOwnershipPolicy/RLS 上下文 |
| Guard | KitchenOwnerGuard | 要求 membership.role=OWNER | 仅个别路由使用；无 Permission enum/decorator |
| Policy | KitchenResourcePolicy | 统一验证本厨房 Dish、MealPlan、ACTIVE Member | Phase 1 先覆盖菜单域；Phase 2 下沉 Repository/通用 Policy |
| Decorator | CurrentUser | 读取可信 req.user | 类型与契约分散 |
| Decorator | CurrentKitchen | 读取 Guard 注入厨房 | 使用范围有限 |
| Interceptor | ResponseInterceptor | 包装成功响应 | 不符合 v2 meta 契约 |
| Interceptor | AuditInterceptor | 写操作完成后同步写 AuditLog | 与业务非同事务，不是 Outbox |
| Middleware | RequestIdMiddleware | 接收/生成 requestId | 需规范 UUID/可信边界 |
| Middleware | RateLimitMiddleware | Redis 按 IP+path 计数 | 路径可高基数；登录/邀请/AI无独立策略 |
| Filter | ApiExceptionFilter | 统一异常 | 无稳定 code/字段级 details，需隐藏生产内部信息验证 |

## 验收与回滚

- Phase 1 每个严重关联路由必须有真实 AppModule+PostgreSQL 跨厨房测试。
- Phase 2 拆分时保持上述 v1 路径，使用 Contract Test 防回归。
- 回滚采用模块级提交和 v1 兼容，不以移除 `kitchenId` 校验换取可用性。
