import type { ApiError } from '../contracts/api';

export class ClientApiError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode: number, readonly details: unknown = null, readonly requestId?: string) { super(message); this.name = 'ClientApiError'; }
}

export function toClientError(statusCode: number, error?: Partial<ApiError>, requestId?: string) {
  const fallback: [string, string] = statusCode === 401 ? ['AUTH_REQUIRED', '登录已过期'] : statusCode === 403 ? ['FORBIDDEN', '没有操作权限'] : statusCode === 404 ? ['RESOURCE_NOT_FOUND', '内容不存在'] : statusCode === 409 ? ['CONFLICT', '操作冲突，请刷新后重试'] : statusCode === 429 ? ['RATE_LIMITED', '请求过于频繁'] : statusCode >= 500 ? ['SERVER_UNAVAILABLE', '服务暂时不可用'] : ['REQUEST_FAILED', '请求失败'];
  return new ClientApiError(error?.code ?? fallback[0], error?.message ?? fallback[1], statusCode, error?.details ?? null, error?.requestId ?? requestId);
}
