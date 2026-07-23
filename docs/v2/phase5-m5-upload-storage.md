# Phase 5：M5 上传元数据与生产存储完成记录

日期：2026-07-20。对应剩余执行计划任务 5。

## Schema 与兼容迁移

- `UploadFile` 新增 `storageDriver`、`checksum`、`status`、`thumbnailKey`；驱动和状态使用数据库 enum，缩略图 key 唯一，状态/创建时间有清理索引。
- Expand Migration 将历史记录默认标记为 LOCAL，不伪造 checksum；checksum 在兼容窗口允许 null，并有格式约束。
- `m5_upload_checksums.ts` 从受限 Local 根目录读取历史对象、计算 SHA-256，并用 `id + checksum IS NULL` 条件可重入更新。路径逃逸会失败关闭。
- Expand 与回填期间旧 Local 文件仍可读；有 checksum 的对象读取时必须匹配，否则统一返回不存在且不泄露损坏字节。

## 存储行为

- 新上传去元数据重编码为 WebP，同时生成最大 320×320 的私有 WebP 缩略图；两者使用同一厨房 key 前缀。
- 原图 checksum、实际落盘驱动、ACTIVE 状态和缩略图 key 与记录一起持久化；数据库失败时清理两类对象。
- COS 模式缺少 SecretId、SecretKey、Bucket 或 Region 时配置校验直接阻断启动。
- COS 写失败且显式允许 fallback 时，先清理可能的半写 COS 对象，再将原图和缩略图成对写入 Local，并把实际驱动记录为 LOCAL。
- COS 历史记录读取失败时可双读 Local fallback；LOCAL 记录始终只走受限 Local Adapter。所有 HTTP 读取继续经过 JWT、厨房成员 Guard 和 `id+kitchenId` 查询，不公开永久 URL。
- 删除同时标记 DELETED/deletedAt 并清理原图与缩略图；后台清理只处理达到保留时间的 DELETED 记录，不触碰 ACTIVE 对象。

## 验收证据

- 上传专项 12/12：格式/超限/跨厨房、WebP 与缩略图、持久 checksum、损坏检测、旧 Local 兼容、删除和孤立元数据清理、COS 写失败回退和 COS→Local 双读。
- 生产配置与 Migration 专项 7/7；合计专项 19/19。
- 七个 Migration 在专用 `love_kitchen_test` 成功部署。

## 发布与回滚

1. 先部署 Expand Migration，再以与旧服务相同的 `UPLOAD_LOCAL_DIR` 执行 checksum 回填并核对 candidates/updated 与 null 余量。
2. 灰度 COS 前确认私有桶策略和 Local 共享卷；若没有可跨实例访问的 Local 卷，生产必须设置 `UPLOAD_COS_FALLBACK_LOCAL=false`。
3. 回滚应用时保留新增列、缩略图和 checksum；切回 Local 只改变新写驱动，不删除 COS 对象。
4. checksum Contract（NOT NULL）只能在生产回填余量为零并完成抽样读取后通过后续 Roll-forward Migration 收紧。
