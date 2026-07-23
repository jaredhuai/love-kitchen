import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/common/configure-http-app';

const KITCHEN_A = '60000000-0000-4000-8000-000000000001';
const KITCHEN_B = '60000000-0000-4000-8000-000000000002';
const USER_A = '60000000-0000-4000-8000-000000000011';
const USER_B = '60000000-0000-4000-8000-000000000012';
const USER_C = '60000000-0000-4000-8000-000000000021';
const USER_D = '60000000-0000-4000-8000-000000000022';

describe('Love letter security (real AppModule and PostgreSQL)', () => {
  let app: INestApplication; let prisma: PrismaClient;
  let tokenA: string; let tokenB: string; let tokenC: string;

  beforeAll(async () => {
    if (new URL(process.env.DATABASE_URL ?? '').pathname !== '/love_kitchen_test') throw new Error('Letter E2E requires love_kitchen_test');
    prisma = new PrismaClient(); await prisma.$connect(); await cleanup(prisma); await seed(prisma);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication(); configureHttpApp(app); await app.init();
    const jwt = app.get(JwtService); const options = { secret: app.get(ConfigService).getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: '5m' as const };
    tokenA = await jwt.signAsync({ sub: USER_A }, options);
    tokenB = await jwt.signAsync({ sub: USER_B }, options);
    tokenC = await jwt.signAsync({ sub: USER_C }, options);
  });
  afterAll(async () => { if (prisma) await cleanup(prisma); if (app) await app.close(); if (prisma) await prisma.$disconnect(); });

  it('encrypts content, records keyVersion, and never returns ciphertext from create/list', async () => {
    const created = await createLetter({ title: '秘密', content: '今晚吃火锅', unlockType: 'DATE', unlockAt: '2099-01-01T00:00:00.000Z' }).expect(201);
    expect(created.body.data).not.toHaveProperty('encryptedContent'); expect(created.body.data).not.toHaveProperty('keyVersion');
    const stored = await prisma.loveLetter.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(stored.encryptedContent).not.toContain('今晚吃火锅'); expect(stored.keyVersion).toBe(1);
    const list = await get(tokenA, '').expect(200); expect(list.body.data[0]).not.toHaveProperty('encryptedContent');
    const event = await prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: stored.id } });
    expect(JSON.stringify(event.payload)).not.toContain('今晚吃火锅');
  });

  it('does not let the sender or another kitchen open a recipient-only letter', async () => {
    const letter = await create('DATE', { unlockAt: '2000-01-01T00:00:00.000Z' });
    await get(tokenA, `/${letter}/open`).expect(404);
    await request(app.getHttpServer()).get(`/api/v1/kitchens/${KITCHEN_B}/love-letters/${letter}/open`).set('Authorization', `Bearer ${tokenC}`).expect(404);
  });

  it('keeps future DATE letters locked and opens elapsed DATE letters', async () => {
    const future = await create('DATE', { unlockAt: '2099-01-01T00:00:00.000Z' });
    expect((await get(tokenB, `/${future}/open`).expect(200)).body.data.locked).toBe(true);
    const elapsed = await create('DATE', { unlockAt: '2000-01-01T00:00:00.000Z', content: '日期正文' });
    expect((await get(tokenB, `/${elapsed}/open`).expect(200)).body.data).toMatchObject({ locked: false, content: '日期正文' });
  });

  it('opens DISH_COUNT only after the active-dish threshold', async () => {
    const letter = await create('DISH_COUNT', { unlockDishCount: 2, content: '菜品正文' });
    expect((await get(tokenB, `/${letter}/open`).expect(200)).body.data.locked).toBe(true);
    await prisma.dish.create({ data: { kitchenId: KITCHEN_A, name: '第二道菜', createdBy: USER_A, tags: [] } });
    expect((await get(tokenB, `/${letter}/open`).expect(200)).body.data.content).toBe('菜品正文');
  });

  it('opens MEAL_COUNT only after the meal-log threshold', async () => {
    const letter = await create('MEAL_COUNT', { unlockMealCount: 1, content: '用餐正文' });
    expect((await get(tokenB, `/${letter}/open`).expect(200)).body.data.locked).toBe(true);
    await prisma.mealLog.create({ data: { kitchenId: KITCHEN_A, eatenAt: new Date(), mealType: 'DINNER', servings: 2, eaterUserIds: [USER_A, USER_B], createdBy: USER_A, imageUrls: [] } });
    expect((await get(tokenB, `/${letter}/open`).expect(200)).body.data.content).toBe('用餐正文');
  });

  it('allows only the sender to manually unlock, then only the recipient to open', async () => {
    const letter = await create('MANUAL', { content: '手动正文' });
    await post(tokenB, `/${letter}/unlock`).expect(404);
    expect((await get(tokenB, `/${letter}/open`).expect(200)).body.data.locked).toBe(true);
    await post(tokenA, `/${letter}/unlock`).expect(201);
    expect((await get(tokenB, `/${letter}/open`).expect(200)).body.data.content).toBe('手动正文');
  });

  it('rejects recipients outside the current kitchen without persisting plaintext or a letter', async () => {
    const before = await prisma.loveLetter.count({ where: { kitchenId: KITCHEN_A } });
    await createLetter({ title: '非法', content: '不能保存', recipientUserId: USER_C, unlockType: 'MANUAL' }).expect(400);
    expect(await prisma.loveLetter.count({ where: { kitchenId: KITCHEN_A } })).toBe(before);
  });

  it('fails closed for an unavailable keyVersion and does not mark the letter opened', async () => {
    const id = await create('DATE', { unlockAt: '2000-01-01T00:00:00.000Z' });
    await prisma.loveLetter.update({ where: { id }, data: { keyVersion: 99 } });
    await get(tokenB, `/${id}/open`).expect(500);
    expect((await prisma.loveLetter.findUniqueOrThrow({ where: { id } })).status).toBe('LOCKED');
  });

  async function create(type: string, extra: Record<string, unknown>) {
    const response = await createLetter({ title: `${type}信`, content: '默认正文', unlockType: type, ...extra }).expect(201); return response.body.data.id as string;
  }
  function createLetter(body: Record<string, unknown>) { return post(tokenA, '').send({ recipientUserId: USER_B, ...body }); }
  function get(token: string, suffix: string) { return request(app.getHttpServer()).get(`/api/v1/kitchens/${KITCHEN_A}/love-letters${suffix}`).set('Authorization', `Bearer ${token}`); }
  function post(token: string, suffix: string) { return request(app.getHttpServer()).post(`/api/v1/kitchens/${KITCHEN_A}/love-letters${suffix}`).set('Authorization', `Bearer ${token}`); }
});

async function seed(prisma: PrismaClient) {
  await prisma.user.createMany({ data: [USER_A, USER_B, USER_C, USER_D].map((id, index) => ({ id, devKey: `phase1-letter-${index}`, nickname: `用户${index}` })) });
  await prisma.kitchen.createMany({ data: [{ id: KITCHEN_A, name: '情书厨房A', createdBy: USER_A }, { id: KITCHEN_B, name: '情书厨房B', createdBy: USER_C }] });
  await prisma.kitchenMember.createMany({ data: [{ kitchenId: KITCHEN_A, userId: USER_A, role: 'OWNER' }, { kitchenId: KITCHEN_A, userId: USER_B, role: 'MEMBER' }, { kitchenId: KITCHEN_B, userId: USER_C, role: 'OWNER' }, { kitchenId: KITCHEN_B, userId: USER_D, role: 'MEMBER' }] });
  await prisma.dish.create({ data: { kitchenId: KITCHEN_A, name: '第一道菜', createdBy: USER_A, tags: [] } });
}

async function cleanup(prisma: PrismaClient) {
  const kitchens = [KITCHEN_A, KITCHEN_B]; const users = [USER_A, USER_B, USER_C, USER_D];
  await prisma.auditLog.deleteMany({ where: { kitchenId: { in: kitchens } } }); await prisma.outboxEvent.deleteMany({ where: { kitchenId: { in: kitchens } } });
  await prisma.loveLetter.deleteMany({ where: { kitchenId: { in: kitchens } } }); await prisma.mealLog.deleteMany({ where: { kitchenId: { in: kitchens } } }); await prisma.dish.deleteMany({ where: { kitchenId: { in: kitchens } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: users } } }); await prisma.kitchenMember.deleteMany({ where: { kitchenId: { in: kitchens } } }); await prisma.kitchen.deleteMany({ where: { id: { in: kitchens } } }); await prisma.user.deleteMany({ where: { id: { in: users } } });
}
