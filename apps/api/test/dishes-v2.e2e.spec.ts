import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { dishesPageV2Schema } from '@love-kitchen/api-contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/common/configure-http-app';

const KITCHEN = '70000000-0000-4000-8000-000000000001';
const USER = '70000000-0000-4000-8000-000000000011';
describe('Dishes API v1 compatibility and v2 contract', () => {
  let app: INestApplication; let prisma: PrismaClient; let token: string;
  beforeAll(async () => {
    prisma = new PrismaClient(); await prisma.$connect(); await cleanup(prisma);
    await prisma.user.create({ data: { id: USER, devKey: 'phase2-dishes', nickname: 'V2用户' } });
    await prisma.kitchen.create({ data: { id: KITCHEN, name: 'V2厨房', createdBy: USER } });
    await prisma.kitchenMember.create({ data: { kitchenId: KITCHEN, userId: USER, role: 'OWNER' } });
    for (let index = 1; index <= 3; index += 1) await prisma.dish.create({ data: { kitchenId: KITCHEN, createdBy: USER, name: `菜${index}`, tags: [], createdAt: new Date(`2026-01-0${index}T00:00:00Z`) } });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = moduleRef.createNestApplication(); configureHttpApp(app); await app.init();
    token = await app.get(JwtService).signAsync({ sub: USER }, { secret: app.get(ConfigService).getOrThrow('JWT_ACCESS_SECRET'), expiresIn: '5m' });
  });
  afterAll(async () => { if (prisma) await cleanup(prisma); if (app) await app.close(); if (prisma) await prisma.$disconnect(); });

  it('keeps v1 offset response compatible and announces deprecation', async () => {
    const response = await get('/api/v1', '?page=1&pageSize=2').expect(200);
    expect(response.body.data).toHaveLength(2); expect(response.headers.deprecation).toBe('true'); expect(response.headers.sunset).toContain('2027');
  });
  it('returns stable non-overlapping v2 cursor pages matching the contract package', async () => {
    const first = await get('/api/v2', '?limit=2').expect(200); expect(first.body.meta).toBeNull(); expect(dishesPageV2Schema.safeParse(first.body.data).success).toBe(true);
    expect(first.body.data.pageInfo.hasNextPage).toBe(true);
    const second = await get('/api/v2', `?limit=2&cursor=${encodeURIComponent(first.body.data.pageInfo.nextCursor)}`).expect(200);
    expect(second.body.data.items).toHaveLength(1); expect(second.body.data.pageInfo).toEqual({ nextCursor: null, hasNextPage: false });
    expect(new Set([...first.body.data.items, ...second.body.data.items].map((item: { id: string }) => item.id)).size).toBe(3);
  });
  it('returns stable v2 errors for invalid cursors and missing resources', async () => {
    expect((await get('/api/v2', '?cursor=forged').expect(400)).body.error.code).toBe('INVALID_CURSOR');
    expect((await request(app.getHttpServer()).get(`/api/v2/kitchens/${KITCHEN}/dishes/70000000-0000-4000-8000-999999999999`).set('Authorization', `Bearer ${token}`).expect(404)).body.error.code).toBe('RESOURCE_NOT_FOUND');
  });
  it('persists Idempotency-Key and replays the same response without duplicate dishes', async () => {
    const url = `/api/v2/kitchens/${KITCHEN}/dishes`; const body = { name: '幂等菜', servings: 2 };
    expect((await request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).send(body).expect(400)).body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const [first, replay] = await Promise.all([
      request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'stable-key-0001').send(body),
      request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'stable-key-0001').send(body),
    ]);
    expect(first.status).toBe(201); expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(first.body.data.id); expect(await prisma.dish.count({ where: { kitchenId: KITCHEN, name: '幂等菜' } })).toBe(1);
    expect((await request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`).set('Idempotency-Key', 'stable-key-0001').send({ name: '不同菜' }).expect(409)).body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
  function get(prefix: string, query: string) { return request(app.getHttpServer()).get(`${prefix}/kitchens/${KITCHEN}/dishes${query}`).set('Authorization', `Bearer ${token}`); }
});
async function cleanup(prisma: PrismaClient) {
  await prisma.idempotencyKey.deleteMany({ where: { userId: USER } }); await prisma.dishReview.deleteMany({ where: { kitchenId: KITCHEN } }); await prisma.dish.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.kitchenMember.deleteMany({ where: { kitchenId: KITCHEN } }); await prisma.kitchen.deleteMany({ where: { id: KITCHEN } }); await prisma.refreshToken.deleteMany({ where: { userId: USER } }); await prisma.user.deleteMany({ where: { id: USER } });
}
