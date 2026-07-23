import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/common/configure-http-app';
import { AI_PROVIDER, AiProviderException, type AiProvider } from '../src/infra/ai/ai-provider';
import { RedisService } from '../src/infra/redis.service';

const USER = '79000000-0000-4000-8000-000000000001';
const KITCHEN = '79000000-0000-4000-8000-000000000011';
const valid = {
  recommendations: [{ name: '番茄鸡蛋', reason: '现有菜品适合', ingredients: ['番茄', '鸡蛋'] }],
};

describe('AI Orchestrator (real AppModule/PostgreSQL/Redis)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let redis: RedisService;
  let token: string;
  const completeJson = vi.fn<AiProvider['completeJson']>();

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    await cleanupDb(prisma);
    await prisma.user.create({
      data: { id: USER, devKey: 'ai-orchestrator', nickname: 'AI编排用户' },
    });
    await prisma.kitchen.create({ data: { id: KITCHEN, name: 'AI编排厨房', createdBy: USER } });
    await prisma.kitchenMember.create({
      data: { kitchenId: KITCHEN, userId: USER, role: 'OWNER' },
    });
    await prisma.dish.create({
      data: {
        kitchenId: KITCHEN,
        name: '本地菜品',
        category: '家常菜',
        cuisine: '中式',
        servings: 2,
        tags: [],
        sourceType: 'MANUAL',
        createdBy: USER,
      },
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_PROVIDER)
      .useValue({ completeJson })
      .compile();
    app = moduleRef.createNestApplication();
    configureHttpApp(app);
    await app.init();
    redis = app.get(RedisService);
    await redis.client.connect().catch(() => undefined);
    await cleanupRedis(redis);
    token = await app
      .get(JwtService)
      .signAsync(
        { sub: USER },
        { secret: app.get(ConfigService).getOrThrow('JWT_ACCESS_SECRET'), expiresIn: '5m' },
      );
  });

  beforeEach(async () => {
    completeJson.mockReset();
    await prisma.aiUsageRecord.deleteMany({ where: { userId: USER } });
    await prisma.aIMessage.deleteMany({ where: { kitchenId: KITCHEN } });
    await prisma.aIConversation.deleteMany({ where: { kitchenId: KITCHEN } });
    await prisma.auditLog.deleteMany({ where: { kitchenId: KITCHEN } });
    await prisma.outboxEvent.deleteMany({ where: { kitchenId: KITCHEN } });
    await cleanupRedis(redis);
  });
  afterAll(async () => {
    if (redis) await cleanupRedis(redis);
    if (app) await app.close();
    if (prisma) await cleanupDb(prisma);
    if (prisma) await prisma.$disconnect();
  });

  it('coordinates idempotency and records success cost/latency metrics once', async () => {
    completeJson.mockResolvedValue(valid);
    const first = await recommend('ai-success').expect(201);
    const second = await recommend('ai-success').expect(201);
    expect(second.body.data).toEqual(first.body.data);
    expect(completeJson).toHaveBeenCalledTimes(1);
    const usage = await prisma.aiUsageRecord.findUniqueOrThrow({
      where: {
        userId_kitchenId_requestKey: { userId: USER, kitchenId: KITCHEN, requestKey: 'ai-success' },
      },
    });
    expect(usage.status).toBe('SUCCEEDED');
    expect(usage.estimatedInputTokens).toBeGreaterThan(0);
    expect(usage.estimatedOutputTokens).toBeGreaterThan(0);
    expect(usage.costMicros).toBeGreaterThan(0);
    expect(usage.latencyMs).toBeGreaterThanOrEqual(0);
    expect(await prisma.aIConversation.count({ where: { kitchenId: KITCHEN, userId: USER } })).toBe(
      1,
    );
    const metrics = await request(app.getHttpServer())
      .get(`/api/v1/kitchens/${KITCHEN}/ai/usage`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(metrics.body.data).toMatchObject({ requests: 1, statuses: { SUCCEEDED: 1 } });
  });

  it('rejects overlapping requests before a second provider call', async () => {
    let release: ((value: typeof valid) => void) | undefined;
    completeJson.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = recommend('ai-concurrent-one').expect(201);
    const firstPromise = first.then((response) => response);
    while (!release) await new Promise((resolve) => setTimeout(resolve, 5));
    await recommend('ai-concurrent-two')
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('AI_CONCURRENCY_LIMITED'));
    release?.(valid);
    await firstPromise;
    expect(completeJson).toHaveBeenCalledTimes(1);
  });

  it('enforces user/kitchen daily quota atomically', async () => {
    const day = new Date().toISOString().slice(0, 10);
    await redis.client.set(`ai:quota:user:${USER}:${day}`, '20', 'EX', 300);
    await redis.client.set(`ai:quota:kitchen:${KITCHEN}:${day}`, '30', 'EX', 300);
    await recommend('ai-over-quota')
      .expect(429)
      .expect(({ body }) => expect(body.error.code).toBe('AI_QUOTA_EXCEEDED'));
    expect(completeJson).not.toHaveBeenCalled();
  });

  it('uses controlled local fallback without charging successful quota', async () => {
    completeJson.mockRejectedValue(new AiProviderException('AI_TIMEOUT', 'timeout', 504));
    const response = await recommend('ai-fallback').expect(201);
    expect(response.body.data.recommendations[0].name).toBe('本地菜品');
    const usage = await prisma.aiUsageRecord.findUniqueOrThrow({
      where: {
        userId_kitchenId_requestKey: {
          userId: USER,
          kitchenId: KITCHEN,
          requestKey: 'ai-fallback',
        },
      },
    });
    expect(usage).toMatchObject({ status: 'DEGRADED', costMicros: 0 });
    const day = new Date().toISOString().slice(0, 10);
    expect(Number((await redis.client.get(`ai:quota:user:${USER}:${day}`)) ?? 0)).toBe(0);
  });

  it('records safe failure state and releases quota for retry', async () => {
    completeJson.mockRejectedValue(new Error('private prompt must not persist'));
    await recommend('ai-failure').expect(500);
    const usage = await prisma.aiUsageRecord.findUniqueOrThrow({
      where: {
        userId_kitchenId_requestKey: { userId: USER, kitchenId: KITCHEN, requestKey: 'ai-failure' },
      },
    });
    expect(usage.status).toBe('FAILED');
    expect(usage.errorCode).toBe('Error');
    expect(usage.errorCode).not.toContain('private prompt');
    expect(usage.response).toBeNull();
    const day = new Date().toISOString().slice(0, 10);
    expect(Number((await redis.client.get(`ai:quota:user:${USER}:${day}`)) ?? 0)).toBe(0);
  });

  function recommend(key: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/kitchens/${KITCHEN}/ai/recommendations`)
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ request: '清淡', servings: 2 });
  }
});

async function cleanupRedis(redis: RedisService) {
  const keys = await redis.client.keys(`ai:*:${USER}:*`);
  const kitchenKeys = await redis.client.keys(`ai:*:${KITCHEN}:*`);
  if (keys.length + kitchenKeys.length)
    await redis.client.del(...new Set([...keys, ...kitchenKeys]));
}

async function cleanupDb(prisma: PrismaClient) {
  await prisma.aiUsageRecord.deleteMany({
    where: { OR: [{ userId: USER }, { kitchenId: KITCHEN }] },
  });
  await prisma.auditLog.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.outboxEvent.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.aIMessage.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.aIConversation.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.dishReview.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.dishIngredient.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.recipeStep.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.dish.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.refreshTokenSession.deleteMany({ where: { userId: USER } });
  await prisma.refreshToken.deleteMany({ where: { userId: USER } });
  await prisma.kitchenMember.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.kitchen.deleteMany({ where: { id: KITCHEN } });
  await prisma.user.deleteMany({ where: { id: USER } });
}
