# 部署

生产使用 Node 20 LTS 构建 API，运行 Prisma migrate deploy 后以非 root 用户启动。PostgreSQL、Redis 和私有对象存储放在受限网络，入口启用 TLS、WAF 与限流。环境变量由密钥管理服务注入，不烘焙进镜像。上线前验证备份恢复、RLS、跨厨房测试、密钥扫描和告警。
