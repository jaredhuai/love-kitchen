import { HttpException, HttpStatus } from '@nestjs/common';
import type { z } from 'zod';
export const AI_PROVIDER = Symbol('AI_PROVIDER');
export type AiMessage = { role: 'system' | 'user'; content: string };
export type AiRequest = { messages: AiMessage[]; temperature?: number };
export interface AiProvider { completeJson<T>(request: AiRequest, schema: z.ZodType<T>): Promise<T>; }
export type AiErrorCode = 'AI_NOT_CONFIGURED' | 'AI_TIMEOUT' | 'AI_RATE_LIMITED' | 'AI_UPSTREAM_UNAVAILABLE' | 'AI_EMPTY_RESPONSE' | 'AI_INVALID_STRUCTURED_OUTPUT';
export class AiProviderException extends HttpException {
  constructor(code: AiErrorCode, message: string, status: HttpStatus) { super({ code, message, details: null }, status); }
}
export function parseStructured<T>(content: string, schema: z.ZodType<T>) {
  try {
    const result = schema.safeParse(JSON.parse(content) as unknown);
    return result.success ? { success: true as const, data: result.data } : { success: false as const, error: result.error.issues.slice(0, 5).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') };
  } catch { return { success: false as const, error: '响应不是有效 JSON' }; }
}
