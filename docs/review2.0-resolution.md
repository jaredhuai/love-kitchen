# review2.0 修复记录

## 已修复

- 菜品 PATCH 使用独立 `UpdateDishDto`，运行时有 class-validator 元数据。
- Service 不再展开请求对象，而是显式白名单映射 `name`、`description`、`category`、`cuisine`、`servings`、`coverImageUrl` 和 `isFavorite`；`kitchenId`、`createdBy`、`status`、`deletedAt` 等字段无法通过 PATCH 注入。
- JWT access/refresh 有效期改为读取 `ACCESS_TOKEN_EXPIRES_IN` 与 `REFRESH_TOKEN_EXPIRES_IN`，刷新令牌数据库过期时间同步配置。
- 新增 PATCH 字段注入回归测试。
- 菜品更新改为带 `kitchenId`、软删除和状态条件的原子 `updateMany`，避免先查后写竞态。
- 菜品分页参数改为带转换和范围校验的 Query DTO，非法页码由 ValidationPipe 拒绝。
- JWT 有效期配置限制为明确的 `数字+单位` 格式，避免 JWT 与数据库过期时间不一致。

## 验证

API 类型检查、ESLint 通过；API 测试 10 项全部通过。

## 后续范围

评审中列出的微信登录、偏好/菜单/库存、AI、上传、爱情记录和数据库集成测试仍需后续阶段实现，本次不将其伪装为已完成。
