# Phase 1：AI Provider 完成记录

日期：2026-07-12。范围为执行顺序第六项，不进入下一项 Outbox 审计。

## 完成内容

- 新增 `AI_PROVIDER`、`AiProvider`、`DeepseekProvider` 和 `MockAiProvider`；AiService 不再创建或依赖 OpenAI Client。
- Provider 首次输出执行 JSON.parse + Zod；非 JSON 或 Schema 不合法时，仅调用一次 temperature=0 的格式修复；第二次失败返回 `AI_INVALID_STRUCTURED_OUTPUT`。
- 稳定错误包括 `AI_NOT_CONFIGURED`、`AI_TIMEOUT`、`AI_RATE_LIMITED`、`AI_UPSTREAM_UNAVAILABLE`、`AI_EMPTY_RESPONSE`、`AI_INVALID_STRUCTURED_OUTPUT`，并保留对应 HTTP 状态。
- ApiExceptionFilter 会透传可信 HttpException 的结构化 code/details，未结构化异常仍使用安全的通用错误。
- DeepSeek 禁用 SDK 自动重试，单次调用默认 15 秒超时，避免一次业务请求产生隐式重复付费；修复调用是唯一允许的第二次请求。
- AiService 仅查询 `where.kitchenId=当前厨房` 的活动菜品，Provider 返回并通过 Schema 后才创建 Conversation/Message。

## 测试与证据

- `pnpm test:ai-security`：11/11，通过 Mock/伪客户端完成，不调用真实付费 API。
- 覆盖合法输出、非 JSON 修复、Schema 修复、二次失败、空响应、超时、429、5xx、未配置、非法结果不落库、Prompt 不含其他厨房数据。
- 最终全部 API 测试、lint、typecheck 和 build 结果记录在本项交付说明。

## 风险

- 格式修复会产生最多一次额外模型调用和费用；后续 Orchestrator 必须增加用户/厨房额度、用量记录和成本告警。
- 修复 Prompt 包含最多 8000 字符的模型原输出和校验摘要，但不增加新的数据库/跨厨房数据；不得将该 Prompt 写审计日志。
- 真实 DeepSeek 网络契约未使用生产 Key 自动测试；Staging UAT 必须验证兼容的 json_object 行为、429 和超时。
- 当前只实现推荐 Schema；新增 AI 用途必须定义独立 Zod Schema，禁止复用宽泛 unknown。

## 回滚方案

1. 上游异常或成本失控时移除/禁用 AI Provider 绑定或关闭 AI 路由，返回 `AI_NOT_CONFIGURED`；不影响非 AI 功能。
2. 禁止回滚到 AiService 直连 SDK或未校验落库版本。
3. 可将修复调用临时关闭为首次无效即失败，以减少费用；已验证结果的数据库记录保持可读。
4. Provider 回退不涉及 Migration；已有 AIConversation/AIMessage 无需修改或删除。
