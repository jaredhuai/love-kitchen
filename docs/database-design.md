# 数据库设计

模型定义见 `apps/api/prisma/schema.prisma`。所有主键为 UUID；私密业务模型均含 `kitchenId` 并建立厨房维度索引。删除默认软删除。邀请 token、刷新 token 不存明文。

生产可为私密表启用 PostgreSQL RLS，通过事务级 `app.kitchen_id` 设置访问上下文，策略要求 `kitchen_id = current_setting('app.kitchen_id')::uuid`，应用层 Guard 仍保留。
