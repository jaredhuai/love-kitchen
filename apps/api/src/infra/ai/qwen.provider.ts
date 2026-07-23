import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import type { z } from 'zod';
import {
  AiProviderException,
  parseStructured,
  type AiProvider,
  type AiRequest,
} from './ai-provider';

type QwenCompletionRequest = ChatCompletionCreateParamsNonStreaming & {
  enable_thinking: boolean;
};

@Injectable()
export class QwenProvider implements AiProvider {
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const apiKey = config.get<string>('DASHSCOPE_API_KEY');
    this.model = config.get<string>('QWEN_MODEL') ?? 'qwen3.7-plus';
    this.client = apiKey
      ? new OpenAI({
          apiKey,
          baseURL:
            config.get<string>('QWEN_BASE_URL') ??
            'https://dashscope.aliyuncs.com/compatible-mode/v1',
          timeout: config.get<number>('AI_TIMEOUT_MS') ?? 15_000,
          maxRetries: 0,
        })
      : null;
  }

  async completeJson<T>(request: AiRequest, schema: z.ZodType<T>): Promise<T> {
    const first = await this.complete(request);
    const parsed = parseStructured(first, schema);
    if (parsed.success) return parsed.data;

    const repaired = await this.complete({
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: '你是 JSON 格式修复器。只输出修复后的 JSON，不添加 Markdown 或说明。',
        },
        {
          role: 'user',
          content: JSON.stringify({
            invalidOutput: first.slice(0, 8_000),
            validationError: parsed.error,
          }),
        },
      ],
    });
    const second = parseStructured(repaired, schema);
    if (second.success) return second.data;
    throw new AiProviderException(
      'AI_INVALID_STRUCTURED_OUTPUT',
      'AI 返回结构无效',
      HttpStatus.BAD_GATEWAY,
    );
  }

  private async complete(request: AiRequest) {
    if (!this.client)
      throw new AiProviderException(
        'AI_NOT_CONFIGURED',
        'AI 服务尚未配置',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    try {
      const body: QwenCompletionRequest = {
        model: this.model,
        temperature: request.temperature ?? 0.4,
        response_format: { type: 'json_object' },
        messages: request.messages,
        enable_thinking: true,
      };
      const response = await this.client.chat.completions.create(body);
      const content = response.choices[0]?.message.content;
      if (!content)
        throw new AiProviderException(
          'AI_EMPTY_RESPONSE',
          'AI 返回为空',
          HttpStatus.BAD_GATEWAY,
        );
      return content;
    } catch (error) {
      if (error instanceof AiProviderException) throw error;
      if (['APITimeoutError', 'AbortError'].includes((error as { name?: string }).name ?? ''))
        throw new AiProviderException(
          'AI_TIMEOUT',
          'AI 服务响应超时',
          HttpStatus.GATEWAY_TIMEOUT,
        );
      if ((error as { status?: number }).status === 429)
        throw new AiProviderException(
          'AI_RATE_LIMITED',
          'AI 服务请求过于频繁',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      throw new AiProviderException(
        'AI_UPSTREAM_UNAVAILABLE',
        'AI 上游服务暂时不可用',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
