# Phase 2：Uploads 模块化

日期：2026-07-18。第十项的第八个单模块提交。

## 变更范围

- 将 Uploads 拆分为 Application Service、Presentation Controller、Domain Error 和独立 `UploadsModule`。
- 将 Local/COS Adapter 组装从根 AppModule 收敛到 UploadsModule。
- 保留格式识别、MIME/扩展名一致性、像素上限、WebP 重编码、私有存储、跨厨房隔离、删除和孤立文件清理。
- 非法文件统一返回 `UPLOAD_INVALID_CONTENT`，不存在或越权文件返回 `RESOURCE_NOT_FOUND`。

## 兼容、风险与回滚

- v1 上传、私有读取和删除路径不变。
- 真实 AppModule/PostgreSQL 安全 E2E 8/8 通过，并断言稳定非法内容错误码。
- COS 生产凭证与私有桶配置仍需发布环境验收。
- 回滚时恢复单文件与根组装；UploadFile 记录和存储对象不删除。
