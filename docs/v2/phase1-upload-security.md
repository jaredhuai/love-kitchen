# Phase 1：上传安全完成记录

日期：2026-07-12。范围为执行顺序第五项，不包含下一项 AI Provider。

## 完成内容

- `UploadsService` 仅依赖 `UPLOAD_STORAGE` Token；提供 Local 与腾讯 COS 两种 Adapter。Local 对象权限为 0600 且防路径穿越，COS 使用私有对象和短期签名 URL 能力。
- 上传硬上限 10 MiB、解码像素上限 4000 万；配置只能进一步收紧，不能绕过 Multer 硬上限。
- Sharp 完整解码 JPEG/PNG/WebP，并强制声明 MIME、最终扩展名和真实解码格式完全对应；拒绝双扩展、SVG/HTML、空文件、截断和伪造魔数。
- 原始字节不落正式存储；自动方向校正、移除元数据并统一重编码为 WebP。
- 数据库写入失败会补偿删除对象；读取只经 KitchenAccess + `id+kitchenId` 私有代理，响应使用 `nosniff`、`private, no-store`。
- DELETE 使用 `id+kitchenId` 软删并删除对象；`cleanupDeleted(before)` 分批清理历史软删元数据/孤立对象，供后续 Worker 定时调用。

## 测试与证据

- `pnpm test:uploads`：真实 AppModule + PostgreSQL + 临时私有目录 8/8 通过。
- 覆盖合法重编码、MIME/扩展/内容错配、双扩展与非图片、伪造签名、超限、跨厨房读取和删除、软删物理清理、孤立清理不影响活跃对象。
- 上传套件已加入默认 `pnpm test` 和 `pnpm test:e2e`；完整 E2E 当前为 24 项。

## 风险

- COS Adapter 需要真实私有桶集成/UAT；本项不使用生产凭证做自动测试。配置缺失时应用启动失败，避免静默回落到 Local。
- Sharp/libvips 是原生依赖，构建镜像必须锁定平台并执行依赖漏洞扫描。
- 删除采用“先软删元数据、后删对象”；对象存储短暂失败会留下可重试的软删记录，但该对象没有 API 可访问性。
- checksum 当前随上传响应计算但未持久化；thumbnailKey、storageDriver 和持久 checksum 依照既定 M5 Expand Migration 添加，避免在本安全项跨越数据库生产化阶段。
- `cleanupDeleted` 已具备幂等批处理入口，定时调度归 Outbox/Worker 项；在此之前由运维任务显式调用。

## 回滚方案

1. COS 故障时设置 `UPLOAD_DRIVER=local` 并重启，仅影响新对象；已有 COS 对象不得迁移或删除。
2. 应用回滚必须保留受保护 GET 和 `id+kitchenId` 校验；禁止恢复永久公开 URL或原始字节直存。
3. Sharp 异常时临时关闭上传写入口，已有图片继续私有读取；不得以跳过解码作为降级。
4. 清理任务可立即停用；软删记录保留以便重试，不执行不可逆的批量数据库删除。
