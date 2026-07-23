import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/common/configure-http-app';
import { invalidWechatCode } from '../src/modules/auth/domain/auth.errors';
import { WECHAT_AUTH_PROVIDER } from '../src/modules/auth/infrastructure/wechat-auth.provider';

const OPEN_ID = 'task3-auth-session-openid';
describe('Wechat identity and refresh session security', () => {
  let app: INestApplication; let prisma: PrismaClient;
  beforeAll(async () => {
    if (new URL(process.env.DATABASE_URL ?? '').pathname !== '/love_kitchen_test') throw new Error('Auth Session E2E requires love_kitchen_test');
    prisma = new PrismaClient(); await prisma.$connect(); await cleanup(prisma);
    const provider = { exchange: async (code: string) => { if (code === 'invalid-code') throw invalidWechatCode('微信登录凭证无效'); return { appId: 'task3-app', openId: OPEN_ID, unionId: 'task3-union' }; } };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(WECHAT_AUTH_PROVIDER).useValue(provider).compile();
    app = moduleRef.createNestApplication(); configureHttpApp(app); await app.init();
  });
  afterAll(async () => { if (prisma) await cleanup(prisma); if (app) await app.close(); if (prisma) await prisma.$disconnect(); });

  it('creates a scoped identity and dual-written hashed session without session_key', async () => {
    const login = await wechatLogin('device-a').expect(201);
    expect(login.body.data).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String), user: { nickname: '微信用户' } });
    const identity = await prisma.wechatIdentity.findUniqueOrThrow({ where: { appId_openId: { appId: 'task3-app', openId: OPEN_ID } } });
    expect(identity).toMatchObject({ unionId: 'task3-union' });
    const sessions = await prisma.refreshTokenSession.findMany({ where: { userId: identity.userId } });
    expect(sessions).toHaveLength(1); expect(sessions[0]).toMatchObject({ deviceId: 'device-a', revokedAt: null });
    expect(sessions[0]?.tokenHash).not.toContain(login.body.data.refreshToken);
    const secretColumns = await prisma.$queryRaw<Array<{ column_name: string }>>`SELECT "column_name" FROM information_schema.columns WHERE "table_name" = 'WechatIdentity' AND "column_name" ILIKE '%session%key%'`;
    expect(secretColumns).toHaveLength(0);
  });

  it('rotates atomically and revokes the entire family when an old token is reused', async () => {
    const first = (await wechatLogin('device-rotation').expect(201)).body.data;
    const rotated = (await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken, deviceId: 'device-rotation' }).expect(201)).body.data;
    expect(rotated.refreshToken).not.toBe(first.refreshToken);
    const oldPayload = decode(first.refreshToken); const nextPayload = decode(rotated.refreshToken);
    expect(nextPayload.sid).toBe(oldPayload.sid); expect(nextPayload.jti).not.toBe(oldPayload.jti);
    expect(await prisma.refreshTokenSession.findUnique({ where: { id: nextPayload.jti } })).toMatchObject({ rotatedFromId: oldPayload.jti, revokedAt: null });
    const replay = await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    expect(replay.body.error.code).toBe('AUTH_REFRESH_TOKEN_REUSED');
    expect(await prisma.refreshTokenSession.count({ where: { familyId: oldPayload.sid, revokedAt: null } })).toBe(0);
    expect(await prisma.securityEvent.count({ where: { userId: oldPayload.sub, eventType: 'TOKEN_REUSED' } })).toBe(1);
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: rotated.refreshToken }).expect(401);
  });

  it('serializes concurrent refresh attempts and fails the reused family closed', async () => {
    const login = (await wechatLogin('device-concurrent').expect(201)).body.data;
    const responses = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: login.refreshToken }),
      request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: login.refreshToken }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 401]);
    const payload = decode(login.refreshToken);
    expect(await prisma.refreshTokenSession.count({ where: { familyId: payload.sid, revokedAt: null } })).toBe(0);
    expect(responses.find((response) => response.status === 401)?.body.error.code).toBe('AUTH_REFRESH_TOKEN_REUSED');
  });

  it('supports idempotent current-session logout and all-session logout', async () => {
    const first = (await wechatLogin('logout-a').expect(201)).body.data;
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Authorization', `Bearer ${first.accessToken}`).send({ refreshToken: first.refreshToken }).expect(201);
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Authorization', `Bearer ${first.accessToken}`).send({ refreshToken: first.refreshToken }).expect(201);
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    const second = (await wechatLogin('logout-b').expect(201)).body.data;
    await wechatLogin('logout-c').expect(201);
    const userId = decode(second.refreshToken).sub;
    const response = await request(app.getHttpServer()).post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${second.accessToken}`).expect(201);
    expect(response.body.data.sessionsRevoked).toBeGreaterThanOrEqual(2);
    expect(await prisma.refreshTokenSession.count({ where: { userId, revokedAt: null } })).toBe(0);
  });

  it('records failed WeChat login without the one-time code', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/wechat-login').set('X-Request-Id', 'task3-login-failure').send({ code: 'invalid-code' }).expect(400);
    expect(response.body.error.code).toBe('AUTH_WECHAT_CODE_INVALID');
    const event = await prisma.securityEvent.findFirstOrThrow({ where: { requestId: 'task3-login-failure', eventType: 'LOGIN_FAILED' } });
    expect(event.metadata).toEqual({ reason: 'AUTH_WECHAT_CODE_INVALID' }); expect(JSON.stringify(event)).not.toContain('invalid-code');
  });

  function wechatLogin(deviceId: string) { return request(app.getHttpServer()).post('/api/v1/auth/wechat-login').send({ code: 'valid-code', deviceId }); }
});

function decode(token: string) { return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { sub: string; jti: string; sid: string }; }
async function cleanup(prisma: PrismaClient) {
  const identities = await prisma.wechatIdentity.findMany({ where: { appId: 'task3-app', openId: OPEN_ID }, select: { userId: true } });
  const userIds = identities.map((identity) => identity.userId);
  await prisma.securityEvent.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { requestId: 'task3-login-failure' }] } });
  await prisma.refreshTokenSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.wechatIdentity.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
