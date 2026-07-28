import { assertAllowedRequest, ENV } from '../config/env';
import type { ApiEnvelope, TokenPair } from '../contracts/api';
import { clearAllStores } from '../stores/store-registry';
import { getAccessToken, setSession } from '../stores/auth.store';
import { getRefreshToken } from './session';
import { ClientApiError, toClientError } from './api-error';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type RequestOptions = { method?: Method; data?: WechatMiniprogram.IAnyObject | string | ArrayBuffer; skipAuth?: boolean; idempotencyKey?: string; timeout?: number; retry?: number };
export type Cancelable<T> = { promise: Promise<T>; abort(): void };
let refreshing: Promise<string> | null = null;

export function apiRequest<T>(path: string, options: RequestOptions = {}): Cancelable<T> {
  let task: WechatMiniprogram.RequestTask | undefined;
  let aborted = false;
  const abort = () => { aborted = true; task?.abort(); };
  const promise = execute<T>(path, options, (value) => { task = value; }, () => aborted);
  return { promise, abort };
}

export function request<T>(path: string, options: RequestOptions = {}) { return apiRequest<T>(path, options).promise; }

async function execute<T>(path: string, options: RequestOptions, setTask: (task: WechatMiniprogram.RequestTask) => void, isAborted: () => boolean): Promise<T> {
  const method = options.method ?? 'GET';
  const maxRetries = method === 'GET' ? Math.min(options.retry ?? 2, 2) : 0;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await raw<T>(path, options, setTask, isAborted);
    } catch (error) {
      if (isAborted()) throw new ClientApiError('REQUEST_ABORTED', '请求已取消', 0);
      if (error instanceof ClientApiError && error.statusCode === 401 && !options.skipAuth) {
        try { await refreshAccessToken(); }
        catch { clearAllStores(); wx.reLaunch({ url: '/pages/auth/login' }); throw toClientError(401); }
        return raw<T>(path, options, setTask, isAborted);
      }
      const retryable = method === 'GET' && attempt < maxRetries && (!(error instanceof ClientApiError) || error.statusCode >= 500 || error.statusCode === 0);
      if (!retryable) throw error;
      const delay = 350 * (2 ** attempt) + Math.floor(Math.random() * 150);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function raw<T>(path: string, options: RequestOptions, setTask: (task: WechatMiniprogram.RequestTask) => void, isAborted: () => boolean) {
  assertAllowedRequest(ENV.environment, path);
  return new Promise<T>((resolve, reject) => {
    const requestId = `mp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const task = wx.request<ApiEnvelope<T>>({
      url: `${ENV.apiBaseUrl}${/^\/v\d+\//.test(path) ? path : `/v1${path}`}`, timeout: options.timeout ?? 15_000,
      method: (options.method ?? 'GET') as Exclude<WechatMiniprogram.RequestOption['method'], undefined>,
      ...(options.data === undefined ? {} : { data: options.data }),
      header: { ...(options.skipAuth ? {} : { Authorization: `Bearer ${getAccessToken()}` }), 'X-Request-Id': requestId, ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}) },
      success: (response) => {
        if (isAborted()) return reject(new ClientApiError('REQUEST_ABORTED', '请求已取消', 0));
        if (response.statusCode >= 200 && response.statusCode < 300 && response.data.success) return resolve(response.data.data);
        reject(toClientError(response.statusCode, response.data.success ? undefined : response.data.error, response.header['x-request-id'] as string | undefined));
      },
      fail: (error) => reject(new ClientApiError(isAborted() ? 'REQUEST_ABORTED' : 'NETWORK_ERROR', isAborted() ? '请求已取消' : error.errMsg || '网络连接失败', 0)),
    });
    setTask(task);
  });
}

function refreshAccessToken() {
  if (!refreshing) {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return Promise.reject(toClientError(401));
    refreshing = raw<TokenPair>('/v1/auth/refresh', { method: 'POST', data: { refreshToken }, skipAuth: true }, () => undefined, () => false)
      .then((pair) => { setSession(pair); return pair.accessToken; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export const USE_MOCK = ENV.useMock;
