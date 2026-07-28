import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/common/configure-http-app';

const KITCHEN = '74000000-0000-4000-8000-000000000001';
const OWNER = '74000000-0000-4000-8000-000000000011';
const PARTNER = '74000000-0000-4000-8000-000000000012';

describe('V4 shared memories and story comments', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerToken: string;
  let partnerToken: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    await cleanup(prisma);
    await prisma.user.createMany({ data: [
      { id: OWNER, devKey: 'v4-owner', nickname: '德德' },
      { id: PARTNER, devKey: 'v4-partner', nickname: '桐桐' },
    ] });
    await prisma.kitchen.create({ data: { id: KITCHEN, name: 'V4厨房', createdBy: OWNER } });
    await prisma.kitchenMember.createMany({ data: [
      { kitchenId: KITCHEN, userId: OWNER, role: 'OWNER' },
      { kitchenId: KITCHEN, userId: PARTNER, role: 'MEMBER' },
    ] });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureHttpApp(app);
    await app.init();
    const jwt = app.get(JwtService);
    const secret = app.get(ConfigService).getOrThrow('JWT_ACCESS_SECRET');
    ownerToken = await jwt.signAsync({ sub: OWNER }, { secret, expiresIn: '5m' });
    partnerToken = await jwt.signAsync({ sub: PARTNER }, { secret, expiresIn: '5m' });
  });

  afterAll(async () => {
    if (prisma) await cleanup(prisma);
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
  });

  it('shares the latest warm record with its author name', async () => {
    await request(app.getHttpServer())
      .post(`/api/v2/kitchens/${KITCHEN}/timeline`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', 'v4-warm-memory-0001')
      .send({ title: '更新了今日温暖记录', eventType: 'HOME_MEMORY_TEXT', eventDate: '2026-08-18T09:00:00.000Z', description: '一起做饭最幸福。' })
      .expect(201);
    const response = await request(app.getHttpServer())
      .get(`/api/v1/kitchens/${KITCHEN}/timeline`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .expect(200);
    expect(response.body.data[0]).toMatchObject({ description: '一起做饭最幸福。', createdByName: '德德' });
  });

  it('shows the story creator and lets the partner comment', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/kitchens/${KITCHEN}/stories`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: '第一次做饭', content: '我们一起切菜。', storyDate: '2026-08-18T00:00:00.000Z' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    await request(app.getHttpServer())
      .post(`/api/v1/kitchens/${KITCHEN}/stories/${created.body.data.id}/comments`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ content: '下次还要一起做！' })
      .expect(201);
    const response = await request(app.getHttpServer())
      .get(`/api/v1/kitchens/${KITCHEN}/stories`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(response.body.data[0]).toMatchObject({
      createdByName: '德德',
      comments: [{ authorName: '桐桐', content: '下次还要一起做！' }],
    });
  });
});

async function cleanup(prisma: PrismaClient) {
  await prisma.idempotencyKey.deleteMany({ where: { userId: { in: [OWNER, PARTNER] } } });
  await prisma.storyComment.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.kitchenStory.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.timelineEvent.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.kitchenMember.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.kitchen.deleteMany({ where: { id: KITCHEN } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: [OWNER, PARTNER] } } });
  await prisma.user.deleteMany({ where: { id: { in: [OWNER, PARTNER] } } });
}
