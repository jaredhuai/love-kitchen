# AI 设计

AI Orchestrator 只读取已授权厨房的最小必要上下文，移除密钥、身份凭据和未解锁情书，调用阿里云百炼 OpenAI 兼容的千问 Chat Completions（默认 `qwen3.7-plus`，开启深度思考）。输出为 JSON，经 Zod 校验；首次失败最多要求模型修复一次。调用失败返回可恢复错误，不影响 CRUD。营养值以标准食材库的确定性计算为准。
