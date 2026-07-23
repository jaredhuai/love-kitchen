# 2.0 发布路线图

## 阶段门

| Phase | 范围 | 进入条件 | 完成条件 | 回滚边界 |
|---|---|---|---|---|
| 0 | 审计与基线 | 当前 1.0 仓库 | 六份文档、TASKS、Git 基线、真实命令结果 | 仅文档提交可整体回退 |
| 1 | 安全阻断 | Phase 0 获审 | IDOR/状态机/E2E/上传/AI/Outbox/情书/根门全绿 | 每项独立 PR，数据 Expand-only |
| 2 | 模块化与 API v2 | Phase 1 全绿 | Policy/Repository、稳定错误、Cursor、幂等、v1兼容 | Feature Flag 回 v1 |
| 3 | 数据库生产化 | v2 契约稳定 | 新模型、Migration/回填/检查、RLS方案 | Roll-forward、停用新路径 |
| 4 | 微信认证 | Session 模型可用 | WechatIdentity、超时、登出、重用检测 | 临时保留旧登录兼容 |
| 5 | 存储 | Adapter 与迁移完成 | Local/COS、私有访问、缩略图、安全测试 | 双读并回 Local |
| 6 | AI | Provider 完成 | Orchestrator、限额、监控、Mock/降级 | Feature Flag 禁用 AI |
| 7 | Worker | Outbox 稳定 | 审计、通知、情书、成就、提醒、重试 | 停 Worker，不丢事件 |
| 8 | 前端 2.0 | v2 API 稳定 | 环境/Store/API v2/隐私/注销/Smoke/UAT | 页面级 Flag 回 v1 |
| 9 | 上线 | 全部质量门 | Staging、CI/CD、监控、备份恢复、UAT、上线清单 | 镜像/DB Roll-forward 回滚 |

Phase 0–2 已完成。Phase 3–9 的细化顺序、依赖、验收和回滚以 [`remaining-work-execution-plan.md`](remaining-work-execution-plan.md) 为执行索引。

## P0 上线范围

真实微信登录、协议隐私、厨房/邀请/双人隔离、菜品点评、菜单、库存购物、AI、上传、纪念日、情书、注销、厨房删除、通知、审计、安全测试、CI/CD 和生产部署。

## 发布风险

- 安全修复与功能扩展混合会扩大回滚范围。
- 单 Migration 承载历史结构，迁移必须先建立测试恢复链路。
- 前端仍使用 v1 且环境写死 development，生产构建必须有阻断检查。
- 无真实 E2E 时不得进入 Staging。

## 质量门

每 Phase 必须列出文件、数据库/API/兼容/安全影响、回滚，执行 lint、typecheck、unit、E2E、security、coverage 和 build，并更新 README/docs。任何跳过均视为未完成。
