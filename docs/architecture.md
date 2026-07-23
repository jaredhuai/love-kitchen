# 架构

原生微信小程序通过统一请求层访问 NestJS REST API。JWT Guard 验证身份，Kitchen Access Guard 查询有效成员关系并注入可信上下文，业务服务使用 Prisma 访问 PostgreSQL。Redis 用于限流、短期缓存和幂等。上传、AI 均通过适配器隔离供应商实现。

领域写操作在事务内保存审计日志和派生事件。邀请接受使用事务与厨房行锁/可串行化隔离，避免并发超员。
