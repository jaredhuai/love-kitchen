# 1.0 数据库清单

审计日期：2026-07-20。Prisma Schema 当前有 **40 个 model**、18 个业务 enum、10 个 Migration。

## 模型与租户边界

| 模型 | kitchenId | 软删除/状态 | 关键唯一/索引 | 关键关联与风险 |
|---|---|---|---|---|
| User | 否 | status | wechatOpenId、devKey 唯一 | legacy 微信字段保留兼容；正式身份由 WechatIdentity 管理 |
| WechatIdentity | 否 | 无 | `(appId,openId)`、`(userId,appId)` 唯一 | 不保存 session_key；身份与 User 解耦 |
| UserProfile | 否 | 无 | userId 唯一 | 健康数据；需隐私/删除策略 |
| RefreshToken | 否 | revokedAt/expiresAt | tokenHash 索引 | legacy 双写兼容，待 Contract 阶段移除 |
| RefreshTokenSession | 否 | revokedAt/expiresAt/revokeReason | tokenHash、familyId、userId 索引 | hash-only、Rotation 链、设备和 family 重用检测 |
| SecurityEvent | 可空 | 不可变事件 | type/severity/createdAt、userId/createdAt 索引 | metadata 必须脱敏，不保存 Token/code/session_key |
| DataExportJob | 否 | PENDING/PROCESSING/COMPLETED/FAILED/EXPIRED | `(userId,requestKey)` 唯一；状态/过期索引 | 结果有 7 天保留期；只含本人授权范围和安全白名单字段 |
| AccountDeletionJob | 否 | COOLING_OFF/PROCESSING/COMPLETED/CANCELLED/FAILED/RESTORED | `(userId,requestKey)` 唯一；状态/计划时间索引 | recovery token 只存 hash；物理清除关闭 |
| AiUsageRecord | 是 | IN_PROGRESS/SUCCEEDED/DEGRADED/FAILED | `(userId,kitchenId,requestKey)` 唯一；用户/厨房状态时间索引 | 估算 Token/成本/延迟；响应按 expiresAt 清除 |
| ConsumerReceipt | 间接（Outbox ID） | 已处理收据 | `(outboxEventId,consumer)` 唯一 | 支持多 Consumer 重放幂等；不保存业务正文 |
| Kitchen | 自身租户根 | deletedAt | createdBy 索引 | maxMembers 仅应用层执行 |
| KitchenMember | 是 | MemberStatus | `(kitchenId,userId)` 唯一；kitchenId/status 索引 | 无“每用户仅一个活跃厨房”数据库约束 |
| KitchenInvite | 是 | InviteStatus/revokedAt/usedAt | tokenHash 唯一；kitchenId/status 索引 | 并发依赖 Serializable |
| Dish | 是 | DishStatus/deletedAt | kitchenId/status/category/cuisine 等索引 | 创建者 ID 无 FK；图片 URL 模型不统一 |
| DishIngredient | 是 | 无 | `(dishId,sortOrder)` 索引 | kitchenId 与 Dish 一致性仅应用层 |
| RecipeStep | 是 | 无 | `(dishId,stepNo)` 唯一 | kitchenId 与 Dish 一致性仅应用层 |
| DishReview | 是 | 无 | `(dishId,userId)` 唯一 | userId 无 FK，kitchenId 与 Dish 未数据库约束 |
| MealPreferenceSession | 是 | OPEN/READY_TO_REVEAL/REVEALED/CLOSED + version | `(kitchenId,mealDate,mealType)` 唯一 | M1 已完成；成员变化仍需领域策略 |
| MealPreferenceSubmission | 是 | hiddenBeforeReveal/revealedAt | `(sessionId,userId)` 唯一 | kitchenId 与 Session 一致性仅应用层 |
| TimelineEvent | 是 | 无 | kitchenId/eventDate 索引 | 无软删；eventType 自由字符串 |
| MealPlanGroup | 是 | 无 | `(kitchenId,weekStart)` 唯一 | createdBy 无 FK |
| MealPlan | 是 | status 字符串 | kitchenId/mealDate 索引 | dishId/cookUserId 无 FK；严重跨厨房关联风险 |
| MealVote | 是 | 无 | `(mealPlanId,userId)` 唯一 | kitchenId 与 Plan 一致性仅应用层 |
| MealLog | 是 | 无 | kitchenId/eatenAt 索引 | dishId/mealPlanId/cookedBy 无 FK；eaterUserIds 数组无约束 |
| CookingAssignment | 是 | 无 | `(kitchenId,assignmentDate)` 唯一 | 四类用户 ID 无 FK/成员约束 |
| PantryItem | 是 | status 字符串 | kitchenId/status/expiresAt 索引 | createdBy/updatedBy 无 FK |
| ShoppingItem | 是 | checked | kitchenId/checked 索引 | assignedTo/checkedBy/mealPlanId 无 FK |
| NutritionFood | 否（公共库） | 无 | name 唯一 | 公共标准数据，应版本化来源 |
| AIConversation | 是 | 无 | kitchenId/userId 索引 | userId 无 FK；隐私保留期未定义 |
| AIMessage | 是 | 无 | conversationId/createdAt 索引 | kitchenId 与 Conversation 一致性仅应用层 |
| KitchenStory | 是 | deletedAt | kitchenId/storyDate 索引 | imageUrls 字符串数组未绑定 UploadFile |
| AchievementDefinition | 否（公共定义） | active | code 唯一 | 公共配置 |
| KitchenAchievement | 是 | unlockedAt | `(kitchenId,definitionId)` 唯一 | 派生状态需 Worker 幂等 |
| Anniversary | 是 | 无 | kitchenId/date 索引 | 无更新/删除策略 |
| LoveLetter | 是 | deletedAt/status | kitchenId/recipient/status 索引 | 无 keyVersion；用户 ID 无 FK |
| Notification | 是 | readAt | `(userId,type,sourceKey)` 唯一；sourceEventId 索引 | Consumer 投递幂等；userId 仍无 FK |
| UploadFile | 是 | deletedAt/UploadFileStatus | storageKey/thumbnailKey 唯一；status/createdAt 索引 | storageDriver、checksum、thumbnailKey 已完成；历史 checksum 在 Contract 前可空 |
| OutboxEvent | 是 | PENDING/PROCESSING/PROCESSED/DEAD | status/availableAt/createdAt、kitchenId/createdAt | backlog 监控与保留清理需运维化 |
| IdempotencyKey | 是 | response null/complete | `(userId,operation,key)` 唯一、expiresAt | 清理 Job 与更多 v2 写路由接入待完成 |
| AuditLog | 可空 | 不可变意图 | kitchenId/createdAt、userId/createdAt 索引 | 当前事后写，缺 Outbox 原子性 |

## 枚举

- KitchenRole、MemberStatus、InviteStatus、DishSource、DishStatus、MealType、StorageLocation、LetterUnlockType。

## 约束缺口

1. 多个私密子表同时保存 `kitchenId` 与父资源 ID，但数据库无法保证二者属于同一厨房。
2. 大量 userId/createdBy/assignedTo 字段没有 User 外键，也没有 KitchenMember 约束。
3. 厨房最多两名 ACTIVE 成员、用户最多一个 ACTIVE 厨房缺少数据库级防御。
4. MealPreferenceSession 已由 M1 增加显式状态与乐观锁版本；成员变化时的场次治理留待成员领域升级。
5. RefreshTokenSession 已补齐设备、family/Rotation/重用状态；legacy RefreshToken 仍在兼容期。
6. IdempotencyKey、OutboxEvent、SecurityEvent、导出/注销 Job 已存在；永久清除待恢复演练后单独审批。
7. RLS 只在文档建议中出现，Migration 未创建任何 Policy。

## 软删除与不可变数据

- 明确软删：Kitchen、Dish、KitchenStory、LoveLetter、UploadFile。
- 状态代替软删：KitchenMember、KitchenInvite、PantryItem 等。
- 当前 MealPlan 使用硬删除；是否保留历史需在 Phase 1/2 明确。
- AuditLog 应不可修改/删除；当前数据库未提供防篡改约束。

## Migration 现状

- 1.0 基线 Migration：`20260710081446_pnpm_db_seedpnpm_dev`，其后已有五个独立 v2 Expand Migration。
- 基线文件体量大且名称不规范，作为 1.0 基线保留，不得改写。
- 后续采用 Expand → Backfill → Verify → Contract；每批提供检查与 Roll-forward。

## 验收与回滚

- Phase 1 建独立 test 数据库，从该 Migration+Seed 重建并执行安全 E2E。
- Phase 3 新增模型均使用新 Migration，不减少 1.0 记录数。
- 数据回退优先 Roll-forward；禁止无备份 DROP/破坏性回退。
