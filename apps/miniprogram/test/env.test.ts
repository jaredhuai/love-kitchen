import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('production environment guard', () => {
  it('keeps the checked-in runtime configuration empty for automatic environment selection', async () => {
    const { runtimeConfig } = await import('../miniprogram/config/runtime.config');
    expect(runtimeConfig).toEqual({ environment: '', apiBaseUrl: '' });
  });
  beforeEach(() => { vi.resetModules(); (globalThis as any).wx = { getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }) }; });
  it('accepts only a configured HTTPS production endpoint', async () => {
    const { resolveEnvironment } = await import('../miniprogram/config/env');
    expect(resolveEnvironment('production', 'https://api.love-kitchen.cn/api').apiBaseUrl).toBe('https://api.love-kitchen.cn/api');
  });
  it.each(['http://api.love-kitchen.cn/api', 'https://api.example.com/api', 'https://localhost/api', 'https://api.love-kitchen.cn/dev'])('blocks unsafe endpoint %s', async (url) => {
    const { resolveEnvironment } = await import('../miniprogram/config/env');
    expect(() => resolveEnvironment('production', url)).toThrow();
  });
  it('blocks dev-login in production', async () => {
    const { assertAllowedRequest } = await import('../miniprogram/config/env');
    expect(() => assertAllowedRequest('production', '/v1/auth/dev-login')).toThrow();
  });
});
