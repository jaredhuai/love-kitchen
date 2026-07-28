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
  it('validates nine categories, persists ordered images and creates a temporary meal binding', async () => {
    const uploads = await Promise.all([0, 1].map((index) => prisma.uploadFile.create({
      data: {
        kitchenId: KITCHEN,
        storageKey: `${KITCHEN}/v3-${index}.webp`,
        mimeType: 'image/webp',
        sizeBytes: 10,
        originalName: `v3-${index}.png`,
        createdBy: USER,
      },
    })));
    const permanent = await request(app.getHttpServer())
      .post(`/api/v1/kitchens/${KITCHEN}/dishes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'V3荤菜', category: 'MEAT', notes: '少盐', story: '第一次一起学会的菜', imageUploadIds: uploads.map((upload) => upload.id) })
      .expect(201);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/kitchens/${KITCHEN}/dishes/${permanent.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.data).toMatchObject({ category: 'MEAT', notes: '少盐', story: '第一次一起学会的菜', ratingAverage: null, ratingCount: 0 });
    await request(app.getHttpServer())
      .patch(`/api/v1/kitchens/${KITCHEN}/dishes/${permanent.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ story: '后来又一起做了很多次' })
      .expect(200);
    expect((await prisma.dish.findUniqueOrThrow({ where: { id: permanent.body.data.id } })).story).toBe('后来又一起做了很多次');
    expect(detail.body.data.images.map((image: { uploadId: string }) => image.uploadId)).toEqual(uploads.map((upload) => upload.id));
    await request(app.getHttpServer())
      .delete(`/api/v1/kitchens/${KITCHEN}/uploads/${uploads[0]!.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/kitchens/${KITCHEN}/dishes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '错误分类', category: '家常菜' })
      .expect(400);
    const temporary = await request(app.getHttpServer())
      .post(`/api/v1/kitchens/${KITCHEN}/dishes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '当天火锅', kind: 'TEMPORARY', category: 'OTHER', effectiveDate: '2026-08-18', temporaryMealType: 'DINNER' })
      .expect(201);
    expect(await prisma.mealPlan.count({ where: { kitchenId: KITCHEN, dishId: temporary.body.data.id, mealDate: new Date('2026-08-18') } })).toBe(1);
  });
  function get(prefix: string, query: string) { return request(app.getHttpServer()).get(`${prefix}/kitchens/${KITCHEN}/dishes${query}`).set('Authorization', `Bearer ${token}`); }
});
async function cleanup(prisma: PrismaClient) {
  await prisma.idempotencyKey.deleteMany({ where: { userId: USER } }); await prisma.mealPlan.deleteMany({ where: { kitchenId: KITCHEN } }); await prisma.mealPlanGroup.deleteMany({ where: { kitchenId: KITCHEN } }); await prisma.dishReview.deleteMany({ where: { kitchenId: KITCHEN } }); await prisma.dish.deleteMany({ where: { kitchenId: KITCHEN } }); await prisma.uploadFile.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.kitchenMember.deleteMany({ where: { kitchenId: KITCHEN } }); await prisma.kitchen.deleteMany({ where: { id: KITCHEN } }); await prisma.refreshToken.deleteMany({ where: { userId: USER } }); await prisma.user.deleteMany({ where: { id: USER } });
}
