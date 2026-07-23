# 测试策略

单元测试覆盖默契度、营养、加密和 AI JSON；服务测试覆盖 Guard 与业务规则；Supertest 覆盖认证、厨房 A/B 隔离、角色、邀请生命周期、评分 upsert、隐藏提交、上传和未解锁情书。AI 始终注入 Mock Client。CI 顺序为 generate、lint、typecheck、test、build。
