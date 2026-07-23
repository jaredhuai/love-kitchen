import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { notificationsPageV2Schema } from '@love-kitchen/api-contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/common/configure-http-app';

const KITCHEN = '73000000-0000-4000-8000-000000000001';
const USER = '73000000-0000-4000-8000-000000000011';
const PARTNER = '73000000-0000-4000-8000-000000000012';
const PARTNER_NOTIFICATION = '73000000-0000-4000-8000-000000000099';

describe('Notifications API v1 and v2 contract', () => {
  let app: INestApplication; let prisma: PrismaClient; let token: string;
  beforeAll(async () => {
    prisma = new PrismaClient(); await prisma.$connect(); await cleanup(prisma);
    await prisma.user.createMany({ data: [{ id: USER, devKey: 'phase2-notifications-user', nickname: '通知用户' }, { id: PARTNER, devKey: 'phase2-notifications-partner', nickname: '通知伴侣' }] });
    await prisma.kitchen.create({ data: { id: KITCHEN, name: '通知厨房', createdBy: USER } });
    await prisma.kitchenMember.createMany({ data: [{ kitchenId: KITCHEN, userId: USER, role: 'OWNER' }, { kitchenId: KITCHEN, userId: PARTNER, role: 'MEMBER' }] });
    for (let index = 1; index <= 3; index += 1) await prisma.notification.create({ data: { kitchenId: KITCHEN, userId: USER, type: 'REMINDER', title: `提醒${index}`, content: '请查看', createdAt: new Date('2026-05-01T00:00:00Z') } });
    await prisma.notification.create({ data: { id: PARTNER_NOTIFICATION, kitchenId: KITCHEN, userId: PARTNER, type: 'PRIVATE', title: '伴侣通知', content: '不应泄露' } });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = moduleRef.createNestApplication(); configureHttpApp(app); await app.init();
    token = await app.get(JwtService).signAsync({ sub: USER }, { secret: app.get(ConfigService).getOrThrow('JWT_ACCESS_SECRET'), expiresIn: '5m' });
  });
  afterAll(async () => { if (prisma) await cleanup(prisma); if (app) await app.close(); if (prisma) await prisma.$disconnect(); });

  it('returns only the current user notifications in v1', async () => {
    const response = await get('/api/v1').expect(200);
    expect(Array.isArray(response.body.data)).toBe(true); expect(response.body.data).toHaveLength(3);
    expect(response.body.data.every((item: { userId: string }) => item.userId === USER)).toBe(true);
  });

  it('returns contract-valid non-overlapping v2 pages when createdAt ties', async () => {
    const first = await get('/api/v2', '?limit=2').expect(200);
    expect(notificationsPageV2Schema.safeParse(first.body.data).success).toBe(true); expect(first.body.data.pageInfo.hasNextPage).toBe(true);
    const second = await get('/api/v2', `?limit=2&cursor=${encodeURIComponent(first.body.data.pageInfo.nextCursor)}`).expect(200);
    expect(second.body.data.items).toHaveLength(1); expect(second.body.data.pageInfo).toEqual({ nextCursor: null, hasNextPage: false });
    expect(new Set([...first.body.data.items, ...second.body.data.items].map((item: { id: string }) => item.id)).size).toBe(3);
  });

  it('rejects forged cursors with a stable code', async () => {
    expect((await get('/api/v2', '?cursor=forged').expect(400)).body.error.code).toBe('INVALID_CURSOR');
  });

  it('marks only the current user notification as read', async () => {
    const own = await prisma.notification.findFirstOrThrow({ where: { kitchenId: KITCHEN, userId: USER } });
    expect((await request(app.getHttpServer()).patch(`/api/v2/kitchens/${KITCHEN}/notifications/${own.id}/read`).set('Authorization', `Bearer ${token}`).expect(200)).body.data.readAt).toBeTruthy();
    expect((await request(app.getHttpServer()).patch(`/api/v2/kitchens/${KITCHEN}/notifications/${PARTNER_NOTIFICATION}/read`).set('Authorization', `Bearer ${token}`).expect(404)).body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: PARTNER_NOTIFICATION } })).readAt).toBeNull();
  });

  function get(prefix: string, query = '') { return request(app.getHttpServer()).get(`${prefix}/kitchens/${KITCHEN}/notifications${query}`).set('Authorization', `Bearer ${token}`); }
});

async function cleanup(prisma: PrismaClient) {
  await prisma.notification.deleteMany({ where: { kitchenId: KITCHEN } }); await prisma.kitchenMember.deleteMany({ where: { kitchenId: KITCHEN } }); await prisma.kitchen.deleteMany({ where: { id: KITCHEN } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: [USER, PARTNER] } } }); await prisma.user.deleteMany({ where: { id: { in: [USER, PARTNER] } } });
}
