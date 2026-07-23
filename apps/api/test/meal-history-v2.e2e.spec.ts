import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { mealHistoryPageV2Schema } from '@love-kitchen/api-contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/common/configure-http-app';

const KITCHEN = '72000000-0000-4000-8000-000000000001';
const USER = '72000000-0000-4000-8000-000000000011';

describe('Meal History API v1 compatibility and v2 contract', () => {
  let app: INestApplication; let prisma: PrismaClient; let token: string;
  beforeAll(async () => {
    prisma = new PrismaClient(); await prisma.$connect(); await cleanup(prisma);
    await prisma.user.create({ data: { id: USER, devKey: 'phase2-meal-history', nickname: '饮食历史用户' } });
    await prisma.kitchen.create({ data: { id: KITCHEN, name: '饮食历史厨房', createdBy: USER } });
    await prisma.kitchenMember.create({ data: { kitchenId: KITCHEN, userId: USER, role: 'OWNER' } });
    for (let index = 1; index <= 3; index += 1) await prisma.mealLog.create({ data: { kitchenId: KITCHEN, createdBy: USER, eatenAt: new Date('2026-03-01T00:00:00Z'), mealType: 'DINNER', servings: index, eaterUserIds: [USER], imageUrls: [] } });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = moduleRef.createNestApplication(); configureHttpApp(app); await app.init();
    token = await app.get(JwtService).signAsync({ sub: USER }, { secret: app.get(ConfigService).getOrThrow('JWT_ACCESS_SECRET'), expiresIn: '5m' });
  });
  afterAll(async () => { if (prisma) await cleanup(prisma); if (app) await app.close(); if (prisma) await prisma.$disconnect(); });

  it('keeps the v1 array response and deprecation headers', async () => {
    const response = await get('/api/v1').expect(200);
    expect(Array.isArray(response.body.data)).toBe(true); expect(response.body.data).toHaveLength(3);
    expect(response.headers.deprecation).toBe('true'); expect(response.headers.sunset).toContain('2027');
  });

  it('returns contract-valid non-overlapping pages when eatenAt ties', async () => {
    const first = await get('/api/v2', '?limit=2').expect(200);
    expect(mealHistoryPageV2Schema.safeParse(first.body.data).success).toBe(true); expect(first.body.data.pageInfo.hasNextPage).toBe(true);
    const second = await get('/api/v2', `?limit=2&cursor=${encodeURIComponent(first.body.data.pageInfo.nextCursor)}`).expect(200);
    expect(second.body.data.items).toHaveLength(1); expect(second.body.data.pageInfo).toEqual({ nextCursor: null, hasNextPage: false });
    expect(new Set([...first.body.data.items, ...second.body.data.items].map((item: { id: string }) => item.id)).size).toBe(3);
  });

  it('rejects forged cursors with a stable code', async () => {
    expect((await get('/api/v2', '?cursor=forged').expect(400)).body.error.code).toBe('INVALID_CURSOR');
  });

  it('creates and audits once for concurrent equal idempotency keys', async () => {
    const url = `/api/v2/kitchens/${KITCHEN}/meal-history`; const body = { eatenAt: '2026-04-01T00:00:00.000Z', mealType: 'DINNER', servings: 2 };
    expect((await request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send(body).expect(400)).body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const [first, replay] = await Promise.all([
      request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'meal-history-stable-0001').send(body),
      request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'meal-history-stable-0001').send(body),
    ]);
    expect(first.status).toBe(201); expect(replay.status).toBe(201); expect(replay.body.data.id).toBe(first.body.data.id);
    expect(await prisma.mealLog.count({ where: { kitchenId: KITCHEN, eatenAt: new Date(body.eatenAt) } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { kitchenId: KITCHEN, aggregateType: 'MealLog', aggregateId: first.body.data.id } })).toBe(1);
    expect((await request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'meal-history-stable-0001').send({ ...body, servings: 3 }).expect(409)).body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  function get(prefix: string, query = '') { return request(app.getHttpServer()).get(`${prefix}/kitchens/${KITCHEN}/meal-history${query}`).set('Authorization', `Bearer ${token}`); }
});

async function cleanup(prisma: PrismaClient) {
  await prisma.idempotencyKey.deleteMany({ where: { userId: USER } }); await prisma.outboxEvent.deleteMany({ where: { kitchenId: KITCHEN } }); await prisma.mealLog.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.kitchenMember.deleteMany({ where: { kitchenId: KITCHEN } }); await prisma.kitchen.deleteMany({ where: { id: KITCHEN } }); await prisma.refreshToken.deleteMany({ where: { userId: USER } }); await prisma.user.deleteMany({ where: { id: USER } });
}
