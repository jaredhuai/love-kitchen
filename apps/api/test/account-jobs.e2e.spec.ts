import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/common/configure-http-app';
import { AccountJobsService } from '../src/modules/account/application/account-jobs.service';

const USER = '78000000-0000-4000-8000-000000000001';
const PARTNER = '78000000-0000-4000-8000-000000000002';
const OUTSIDER = '78000000-0000-4000-8000-000000000003';
const KITCHEN = '78000000-0000-4000-8000-000000000011';

describe('Data export and account deletion jobs (real AppModule/PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let token: string;
  let outsiderToken: string;

  beforeAll(async () => {
    if (new URL(process.env.DATABASE_URL ?? '').pathname !== '/love_kitchen_test')
      throw new Error('Account Job E2E requires love_kitchen_test');
    prisma = new PrismaClient();
    await prisma.$connect();
    await cleanup(prisma);
    await prisma.user.createMany({
      data: [
        { id: USER, devKey: 'account-job-user', nickname: '导出本人' },
        { id: PARTNER, devKey: 'account-job-partner', nickname: '伴侣' },
        { id: OUTSIDER, devKey: 'account-job-outsider', nickname: '外部用户' },
      ],
    });
    await prisma.kitchen.create({ data: { id: KITCHEN, name: '导出厨房', createdBy: USER } });
    await prisma.kitchenMember.createMany({
      data: [
        { kitchenId: KITCHEN, userId: USER, role: 'OWNER' },
        { kitchenId: KITCHEN, userId: PARTNER, role: 'MEMBER' },
      ],
    });
    const session = await prisma.mealPreferenceSession.create({
      data: { kitchenId: KITCHEN, mealDate: new Date('2026-07-20'), mealType: 'DINNER' },
    });
    await prisma.mealPreferenceSubmission.createMany({
      data: [
        {
          kitchenId: KITCHEN,
          sessionId: session.id,
          userId: USER,
          preferencePayload: { tastes: ['own-secret'] },
        },
        {
          kitchenId: KITCHEN,
          sessionId: session.id,
          userId: PARTNER,
          preferencePayload: { tastes: ['partner-secret'] },
        },
      ],
    });
    await prisma.loveLetter.create({
      data: {
        kitchenId: KITCHEN,
        title: '只导出元数据',
        encryptedContent: 'ciphertext-must-not-export',
        createdBy: USER,
        recipientUserId: PARTNER,
        unlockType: 'MANUAL',
      },
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureHttpApp(app);
    await app.init();
    const jwt = app.get(JwtService);
    const secret = app.get(ConfigService).getOrThrow<string>('JWT_ACCESS_SECRET');
    token = await jwt.signAsync({ sub: USER }, { secret, expiresIn: '5m' });
    outsiderToken = await jwt.signAsync({ sub: OUTSIDER }, { secret, expiresIn: '5m' });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await cleanup(prisma);
    if (prisma) await prisma.$disconnect();
  });

  it('creates an idempotent self-scoped export without secrets or partner submissions', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/account/exports')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'export-one')
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/api/v1/account/exports')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'export-one')
      .expect(201);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(first.body.data.status).toBe('COMPLETED');
    const serialized = JSON.stringify(first.body.data.result);
    expect(serialized).toContain('own-secret');
    expect(serialized).not.toContain('partner-secret');
    expect(serialized).not.toContain('ciphertext-must-not-export');
    expect(serialized).not.toMatch(/recoveryTokenHash|refreshToken|wechatOpenId|storageKey/);
    await request(app.getHttpServer())
      .get(`/api/v1/account/exports/${first.body.data.id}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);
  });

  it('records a failed export safely and retries it', async () => {
    const service = app.get(AccountJobsService);
    const implementation = Reflect.get(service, 'buildExport').bind(service);
    const spy = vi
      .spyOn(service as never, 'buildExport' as never)
      .mockRejectedValueOnce(new Error('private export body'))
      .mockImplementation(implementation);
    await expect(service.requestExport(USER, 'export-retry')).rejects.toThrow(
      'private export body',
    );
    const failed = await prisma.dataExportJob.findUniqueOrThrow({
      where: { userId_requestKey: { userId: USER, requestKey: 'export-retry' } },
    });
    expect(failed.status).toBe('FAILED');
    expect(failed.lastError).toBe('Error');
    expect(failed.lastError).not.toContain('private export body');
    await expect(service.retryExport(USER, failed.id)).resolves.toMatchObject({
      status: 'COMPLETED',
      attempts: 2,
    });
    spy.mockRestore();
  });

  it('supports cooling-off cancellation and keeps permanent purge disabled', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/account/deletion')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'delete-cancel')
      .expect(201);
    expect(created.body.data.job.dryRun).toMatchObject({
      permanentPurgeEnabled: false,
      ownedKitchenCount: 1,
    });
    expect(created.body.data.recoveryToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: USER } })).status).toBe(
      'DELETION_PENDING',
    );
    await request(app.getHttpServer())
      .post(`/api/v1/account/deletion/${created.body.data.job.id}/execute`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/account/deletion/${created.body.data.job.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: USER } })).status).toBe('ACTIVE');
  });

  it('logically deactivates after cooling-off, blocks auth, and restores with the hashed recovery capability', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/account/deletion')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'delete-restore')
      .expect(201);
    const { job, recoveryToken } = created.body.data;
    await prisma.accountDeletionJob.update({
      where: { id: job.id },
      data: { scheduledFor: new Date(0) },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/account/deletion/${job.id}/execute`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(
      await prisma.user.findUnique({
        where: { id: USER },
        select: { status: true, deactivatedAt: true },
      }),
    ).toMatchObject({ status: 'DEACTIVATED', deactivatedAt: expect.any(Date) });
    expect(await prisma.kitchenMember.count({ where: { userId: USER, status: 'ACTIVE' } })).toBe(0);
    await request(app.getHttpServer())
      .get('/api/v1/account/exports/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/account/deletion/${job.id}/restore`)
      .send({ recoveryToken: 'x'.repeat(40) })
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/account/deletion/${job.id}/restore`)
      .send({ recoveryToken })
      .expect(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: USER } })).status).toBe('ACTIVE');
    expect(await prisma.kitchenMember.count({ where: { userId: USER, status: 'ACTIVE' } })).toBe(1);
    expect(
      (await prisma.accountDeletionJob.findUniqueOrThrow({ where: { id: job.id } }))
        .recoveryTokenHash,
    ).not.toBe(recoveryToken);
  });
});

async function cleanup(prisma: PrismaClient) {
  await prisma.dataExportJob.deleteMany({ where: { userId: { in: [USER, PARTNER, OUTSIDER] } } });
  await prisma.accountDeletionJob.deleteMany({
    where: { userId: { in: [USER, PARTNER, OUTSIDER] } },
  });
  await prisma.loveLetter.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.mealPreferenceSubmission.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.mealPreferenceSession.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.refreshTokenSession.deleteMany({
    where: { userId: { in: [USER, PARTNER, OUTSIDER] } },
  });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: [USER, PARTNER, OUTSIDER] } } });
  await prisma.kitchenMember.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.kitchen.deleteMany({ where: { id: KITCHEN } });
  await prisma.user.deleteMany({ where: { id: { in: [USER, PARTNER, OUTSIDER] } } });
}
