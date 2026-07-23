import { BadRequestException, ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/modules/auth';
import { invalidWechatCode } from '../src/modules/auth/domain/auth.errors';
import { WechatCodeProvider } from '../src/modules/auth/infrastructure/wechat-auth.provider';

const configValues: Record<string, string | number> = {
  NODE_ENV: 'test', JWT_ACCESS_SECRET: 'access-secret-test', JWT_REFRESH_SECRET: 'refresh-secret-test',
  ACCESS_TOKEN_EXPIRES_IN: '15m', REFRESH_TOKEN_EXPIRES_IN: '30d',
};

describe('AuthService quality gate', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('blocks dev login in production', async () => {
    const service = makeService({}, {}, { ...configValues, NODE_ENV: 'production' });
    await expect(service.devLogin('user-a')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('issues a UUID session and dual-writes only refresh hashes', async () => {
    const sessionCreate = vi.fn().mockResolvedValue({}); const legacyCreate = vi.fn().mockResolvedValue({});
    const tx = { refreshTokenSession: { create: sessionCreate }, refreshToken: { create: legacyCreate }, kitchenMember: { findFirst: vi.fn().mockResolvedValue(null) } };
    const prisma = { user: { upsert: vi.fn().mockResolvedValue({ id: 'user-id', nickname: 'A' }) }, $transaction: vi.fn((work: (client: object) => unknown) => work(tx)) };
    const jwt = { signAsync: vi.fn().mockResolvedValueOnce('access').mockResolvedValueOnce('refresh-secret-value') };
    await expect(makeService(prisma, jwt).devLogin('user-a')).resolves.toMatchObject({ accessToken: 'access', refreshToken: 'refresh-secret-value' });
    const data = sessionCreate.mock.calls[0]?.[0].data;
    expect(data.id).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/); expect(data.familyId).toBe(data.id);
    expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/); expect(JSON.stringify(sessionCreate.mock.calls[0])).not.toContain('refresh-secret-value');
    expect(legacyCreate.mock.calls[0]?.[0].data.tokenHash).toBe(data.tokenHash);
  });

  it('rejects an unverifiable refresh token', async () => {
    await expect(makeService({}, { verifyAsync: vi.fn().mockRejectedValue(new Error('bad')) }).refresh('invalid-token-value-123')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('records a stable login failure reason without persisting the code', async () => {
    const create = vi.fn().mockResolvedValue({}); const provider = { exchange: vi.fn().mockRejectedValue(invalidWechatCode('bad code')) };
    const service = makeService({ securityEvent: { create } }, {}, configValues, provider);
    await expect(service.wechatLogin('one-time-private-code', { requestId: 'request-1' })).rejects.toBeInstanceOf(BadRequestException);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ requestId: 'request-1', metadata: { reason: 'AUTH_WECHAT_CODE_INVALID' } }) });
    expect(JSON.stringify(create.mock.calls)).not.toContain('one-time-private-code');
  });
});

describe('WechatCodeProvider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fails closed when credentials are absent', async () => {
    await expect(new WechatCodeProvider(config({})).exchange('code')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps network failures to service unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    await expect(new WechatCodeProvider(config({ WECHAT_APP_ID: 'id', WECHAT_APP_SECRET: 'secret' })).exchange('code')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('aborts code2Session at the configured timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: URL, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))));
    await expect(new WechatCodeProvider(config({ WECHAT_APP_ID: 'id', WECHAT_APP_SECRET: 'secret', WECHAT_LOGIN_TIMEOUT_MS: 1 })).exchange('code')).rejects.toMatchObject({ response: { code: 'AUTH_WECHAT_TIMEOUT' } });
  });

  it('rejects a WeChat response without openid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ errcode: 40029, errmsg: 'bad code', session_key: 'must-not-escape' }) }));
    await expect(new WechatCodeProvider(config({ WECHAT_APP_ID: 'id', WECHAT_APP_SECRET: 'secret' })).exchange('code')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns only scoped identity fields and discards session_key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ openid: 'openid', unionid: 'unionid', session_key: 'must-not-escape' }) }));
    await expect(new WechatCodeProvider(config({ WECHAT_APP_ID: 'app-id', WECHAT_APP_SECRET: 'secret' })).exchange('code')).resolves.toEqual({ appId: 'app-id', openId: 'openid', unionId: 'unionid' });
  });
});

function config(values: Record<string, string | number>) { return { get: vi.fn((key: string) => values[key]) } as never; }
function makeService(prisma: object, jwt: object, values = configValues, provider: object = { exchange: vi.fn() }) {
  const cfg = { get: vi.fn((key: string) => values[key]), getOrThrow: vi.fn((key: string) => { const value = values[key]; if (!value) throw new Error(`missing ${key}`); return value; }) };
  return new AuthService(prisma as never, jwt as never, cfg as never, provider as never);
}
