import { HttpStatus } from '@nestjs/common';
import type { z } from 'zod';
import { AiProviderException, parseStructured, type AiProvider, type AiRequest } from './ai-provider';
export class MockAiProvider implements AiProvider {
  readonly requests: AiRequest[] = [];
  constructor(private readonly outputs: Array<string | Error>) {}
  async completeJson<T>(request: AiRequest, schema: z.ZodType<T>): Promise<T> {
    this.requests.push(request); const parsed = parseStructured(this.next(), schema); if (parsed.success) return parsed.data;
    this.requests.push({ messages: [{ role: 'user', content: parsed.error }], temperature: 0 });
    const repaired = parseStructured(this.next(), schema); if (repaired.success) return repaired.data;
    throw new AiProviderException('AI_INVALID_STRUCTURED_OUTPUT', 'AI 返回结构无效', HttpStatus.BAD_GATEWAY);
  }
  private next() { const output = this.outputs.shift(); if (output instanceof Error) throw output; if (!output) throw new AiProviderException('AI_EMPTY_RESPONSE', 'AI 返回为空', HttpStatus.BAD_GATEWAY); return output; }
}
