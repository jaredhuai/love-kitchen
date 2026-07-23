import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/common/configure-http-app';

const KITCHEN = '30000000-0000-4000-8000-000000000001';
const USER_A = '30000000-0000-4000-8000-000000000011';
const USER_B = '30000000-0000-4000-8000-000000000012';
const QUERY = 'date=2026-07-15&mealType=DINNER';
const preference = (ingredient: string) => ({
  cuisines: ['中餐'], tastes: ['清淡'], ingredients: [ingredient], spicyLevel: 1,
  maxMinutes: 30, budget: 80, calorieTarget: 600,
});

describe('Preference state machine (real AppModule and PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('love_kitchen_test')) throw new Error('Preference E2E requires love_kitchen_test');
    prisma = new PrismaClient();
    await prisma.$connect();
    await cleanup(prisma);
    await prisma.user.createMany({ data: [
      { id: USER_A, devKey: 'phase1-pref-a', nickname: '偏好A' },
      { id: USER_B, devKey: 'phase1-pref-b', nickname: '偏好B' },
    ] });
    await prisma.kitchen.create({ data: { id: KITCHEN, name: '偏好厨房', createdBy: USER_A } });
    await prisma.kitchenMember.createMany({ data: [
      { kitchenId: KITCHEN, userId: USER_A, role: 'OWNER' },
      { kitchenId: KITCHEN, userId: USER_B, role: 'MEMBER' },
    ] });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureHttpApp(app);
    await app.init();
    const jwt = app.get(JwtService);
    const options = { secret: app.get(ConfigService).getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: '5m' as const };
    [tokenA, tokenB] = await Promise.all([jwt.signAsync({ sub: USER_A }, options), jwt.signAsync({ sub: USER_B }, options)]);
  });

  afterAll(async () => {
    if (prisma) await cleanup(prisma);
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
  });

  it('keeps one submission OPEN and hides its payload from the partner', async () => {
    await post(tokenA, '').send(preference('番茄')).expect(201);
    const response = await get(tokenB).expect(200);
    expect(response.body.data.state).toBe('OPEN');
    expect(response.body.data.submissions[0].preferencePayload).toBeNull();
    await prisma.mealPreferenceSession.deleteMany({ where: { kitchenId: KITCHEN } });
  });

  it('atomically becomes READY_TO_REVEAL under concurrent submissions', async () => {
    const results = await Promise.all([
      post(tokenA, '').send(preference('豆腐')),
      post(tokenB, '').send(preference('鸡蛋')),
    ]);
    expect(results.map((item) => item.status)).toEqual([201, 201]);
    const session = await prisma.mealPreferenceSession.findFirstOrThrow({ where: { kitchenId: KITCHEN } });
    expect(session.state).toBe('READY_TO_REVEAL');
    expect(session.version).toBe(1);
    expect(await prisma.mealPreferenceSubmission.count({ where: { sessionId: session.id } })).toBe(2);
  });

  it('freezes submissions after READY_TO_REVEAL', async () => {
    expect((await post(tokenA, '').send(preference('牛肉')).expect(409)).body.error.code).toBe('PREFERENCE_SESSION_LOCKED');
  });

  it('reveals exactly once and returns a consistent result to concurrent callers', async () => {
    const results = await Promise.all([post(tokenA, '/reveal'), post(tokenB, '/reveal')]);
    expect(results.map((item) => item.status)).toEqual([201, 201]);
    expect(results[0].body.data.score).toBe(results[1].body.data.score);
    expect(results.every((item) => item.body.data.sessionState === 'REVEALED')).toBe(true);
    const session = await prisma.mealPreferenceSession.findFirstOrThrow({ where: { kitchenId: KITCHEN } });
    expect(session.state).toBe('REVEALED');
    expect(session.version).toBe(2);
    expect(await prisma.mealPreferenceSubmission.count({ where: { sessionId: session.id, hiddenBeforeReveal: false } })).toBe(2);
  });

  it('is read-only after reveal and after close', async () => {
    expect((await post(tokenA, '').send(preference('牛肉')).expect(409)).body.error.code).toBe('PREFERENCE_ALREADY_REVEALED');
    await post(tokenA, '/close').expect(201);
    await post(tokenB, '/close').expect(201);
    await post(tokenB, '').send(preference('鱼')).expect(409);
    const response = await get(tokenB).expect(200);
    expect(response.body.data.state).toBe('CLOSED');
    expect(response.body.data.submissions.every((item: { preferencePayload: unknown }) => item.preferencePayload)).toBe(true);
    const session = await prisma.mealPreferenceSession.findFirstOrThrow({ where: { kitchenId: KITCHEN } });
    expect(session.version).toBe(3);
  });

  it('rejects invalid meal types at the HTTP boundary', async () => {
    await request(app.getHttpServer()).get(`/api/v1/kitchens/${KITCHEN}/preferences?date=2026-07-15&mealType=BRUNCH`)
      .set('Authorization', `Bearer ${tokenA}`).expect(400);
  });

  function post(token: string, suffix: string) {
    return request(app.getHttpServer()).post(`/api/v1/kitchens/${KITCHEN}/preferences${suffix}?${QUERY}`)
      .set('Authorization', `Bearer ${token}`);
  }
  function get(token: string) {
    return request(app.getHttpServer()).get(`/api/v1/kitchens/${KITCHEN}/preferences?${QUERY}`)
      .set('Authorization', `Bearer ${token}`);
  }
});

async function cleanup(prisma: PrismaClient) {
  await prisma.auditLog.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.outboxEvent.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.mealPreferenceSession.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
  await prisma.kitchenMember.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.kitchen.deleteMany({ where: { id: KITCHEN } });
  await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
}
