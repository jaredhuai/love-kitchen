import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = { success?: (value: any) => void; fail?: (value: any) => void };
const storage = new Map<string, unknown>();
const requestMock = vi.fn();

beforeEach(() => {
  vi.resetModules(); requestMock.mockReset(); storage.clear();
  (globalThis as any).wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
    getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value), removeStorageSync: (key: string) => storage.delete(key),
    reLaunch: vi.fn(), request: requestMock,
  };
});

function response(options: Handler, statusCode: number, data: unknown) {
  queueMicrotask(() => options.success?.({ statusCode, data, header: {} }));
  return { abort: vi.fn() };
}

describe('request client', () => {
  it('aborts the underlying WeChat task', async () => {
    const abort = vi.fn(); requestMock.mockImplementation(() => ({ abort }));
    const { apiRequest } = await import('../miniprogram/utils/request');
    const operation = apiRequest('/health'); operation.abort();
    expect(abort).toHaveBeenCalledOnce();
  });
  it('uses one refresh for concurrent 401 responses', async () => {
    storage.set('accessToken', 'old'); storage.set('refreshToken', 'refresh');
    requestMock.mockImplementation((options: Handler & { url: string }) => options.url.endsWith('/auth/refresh')
      ? response(options, 200, { success: true, data: { accessToken: 'new', refreshToken: 'next' } })
      : storage.get('accessToken') === 'new'
        ? response(options, 200, { success: true, data: { ok: true } })
        : response(options, 401, { success: false, error: { code: 'AUTH_REQUIRED', message: 'expired' } }));
    const { request } = await import('../miniprogram/utils/request');
    await Promise.all([request('/one'), request('/two')]);
    expect(requestMock.mock.calls.filter(([value]) => value.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });
  it('retries GET failures but never retries POST', async () => {
    requestMock.mockImplementation((options: Handler) => response(options, 503, { success: false, error: { code: 'DOWN', message: 'down' } }));
    const { request } = await import('../miniprogram/utils/request');
    await expect(request('/items')).rejects.toMatchObject({ code: 'DOWN' });
    expect(requestMock).toHaveBeenCalledTimes(3);
    requestMock.mockClear();
    await expect(request('/items', { method: 'POST', data: {} })).rejects.toMatchObject({ code: 'DOWN' });
    expect(requestMock).toHaveBeenCalledTimes(1);
  });
});
