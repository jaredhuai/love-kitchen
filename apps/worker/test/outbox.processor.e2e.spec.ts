import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OutboxProcessor } from '../src/outbox.processor';
import { WorkerMaintenance } from '../src/worker.maintenance';

const KITCHEN = '50000000-0000-4000-8000-000000000001';
const USER = '50000000-0000-4000-8000-000000000011';

describe('Outbox audit atomicity and processor (real PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    if (new URL(process.env.DATABASE_URL ?? '').pathname !== '/love_kitchen_test')
      throw new Error('Outbox E2E requires love_kitchen_test');
    prisma = new PrismaClient();
    await prisma.$connect();
    await cleanup(prisma);
    await prisma.user.create({ data: { id: USER, devKey: 'phase1-outbox', nickname: '审计用户' } });
    await prisma.kitchen.create({ data: { id: KITCHEN, name: '审计厨房', createdBy: USER } });
  });

  afterAll(async () => {
    if (prisma) await cleanup(prisma);
    if (prisma) await prisma.$disconnect();
  });

  it('rolls back the business write when the outbox write fails', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.kitchenStory.create({
          data: {
            kitchenId: KITCHEN,
            createdBy: USER,
            title: '不应存在',
            content: 'x',
            storyDate: new Date(),
            storyType: 'CUSTOM',
            imageUrls: [],
          },
        });
        await tx.outboxEvent.create({
          data: {
            kitchenId: KITCHEN,
            userId: USER,
            aggregateType: 'KitchenStory',
            aggregateId: 'story',
            eventType: 'STORY_CREATED',
            payload: { action: 'STORY_CREATED', resourceType: 'KitchenStory' },
          },
        });
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');
    expect(await prisma.kitchenStory.count({ where: { kitchenId: KITCHEN } })).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { kitchenId: KITCHEN } })).toBe(0);
  });

  it('commits business data and event atomically, then consumes idempotently', async () => {
    const event = await prisma.$transaction(async (tx) => {
      const story = await tx.kitchenStory.create({
        data: {
          kitchenId: KITCHEN,
          createdBy: USER,
          title: '原子故事',
          content: 'secret body',
          storyDate: new Date(),
          storyType: 'CUSTOM',
          imageUrls: [],
        },
      });
      return tx.outboxEvent.create({
        data: {
          kitchenId: KITCHEN,
          userId: USER,
          aggregateType: 'KitchenStory',
          aggregateId: story.id,
          eventType: 'STORY_CREATED',
          payload: { action: 'STORY_CREATED', resourceType: 'KitchenStory', resourceId: story.id },
          availableAt: new Date(0),
        },
      });
    });
    const processor = new OutboxProcessor(prisma, 5, KITCHEN);
    expect(await processor.processOne()).toBe(true);
    expect(await processor.processOne()).toBe(false);
    expect(await prisma.auditLog.count({ where: { outboxEventId: event.id } })).toBe(1);
    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
      'PROCESSED',
    );
  });

  it('uses SKIP LOCKED so concurrent workers consume an event once', async () => {
    const event = await createEvent(prisma, { action: 'CONCURRENT_TEST', resourceType: 'Test' });
    const workers = [
      new OutboxProcessor(prisma, 5, KITCHEN),
      new OutboxProcessor(prisma, 5, KITCHEN),
    ];
    const results = await Promise.all(workers.map((worker) => worker.processOne()));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { outboxEventId: event.id } })).toBe(1);
  });

  it('rejects non-whitelisted sensitive metadata, retries, then dead-letters without storing its value', async () => {
    const event = await createEvent(prisma, {
      action: 'BAD',
      resourceType: 'Test',
      token: 'super-secret-token',
    });
    const processor = new OutboxProcessor(prisma, 2, KITCHEN);
    expect(await processor.processOne()).toBe(false);
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { availableAt: new Date(0) },
    });
    expect(await processor.processOne()).toBe(false);
    const dead = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(dead.status).toBe('DEAD');
    expect(dead.attempts).toBe(2);
    expect(dead.lastError).toBe('ZodError');
    expect(dead.lastError).not.toContain('super-secret-token');
    expect(await prisma.auditLog.count({ where: { outboxEventId: event.id } })).toBe(0);
  });

  it('recovers an expired PROCESSING lease after a worker crash', async () => {
    const event = await createEvent(prisma, { action: 'LEASE_TEST', resourceType: 'Test' });
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: 'PROCESSING', availableAt: new Date(0) },
    });
    expect(await new OutboxProcessor(prisma, 5, KITCHEN).processOne()).toBe(true);
    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
      'PROCESSED',
    );
  });

  it('cleans only expired idempotency keys in bounded batches', async () => {
    const now = new Date();
    await prisma.idempotencyKey.createMany({
      data: [
        {
          userId: USER,
          operation: 'cleanup',
          key: 'expired-1',
          requestHash: 'a',
          expiresAt: new Date(now.getTime() - 2_000),
        },
        {
          userId: USER,
          operation: 'cleanup',
          key: 'expired-2',
          requestHash: 'b',
          expiresAt: new Date(now.getTime() - 1_000),
        },
        {
          userId: USER,
          operation: 'cleanup',
          key: 'active',
          requestHash: 'c',
          expiresAt: new Date(now.getTime() + 60_000),
        },
      ],
    });
    const maintenance = new WorkerMaintenance(prisma);
    expect(await maintenance.cleanupExpiredIdempotencyKeys(now, 1)).toBe(1);
    expect(await prisma.idempotencyKey.count({ where: { operation: 'cleanup' } })).toBe(2);
    expect(await maintenance.cleanupExpiredIdempotencyKeys(now, 10)).toBe(1);
    expect(
      await prisma.idempotencyKey.findUnique({
        where: { userId_operation_key: { userId: USER, operation: 'cleanup', key: 'active' } },
      }),
    ).not.toBeNull();
  });

  it('reports backlog, lease, dead-letter and age alerts without payload data', async () => {
    await createEvent(
      prisma,
      { action: 'METRIC_PENDING', resourceType: 'Test' },
      { createdAt: new Date(Date.now() - 10_000) },
    );
    await createEvent(
      prisma,
      { action: 'METRIC_PROCESSING', resourceType: 'Test' },
      { status: 'PROCESSING' },
    );
    await createEvent(prisma, { action: 'METRIC_DEAD', resourceType: 'Test' }, { status: 'DEAD' });
    const metrics = await new WorkerMaintenance(prisma, {
      backlog: 1,
      dead: 1,
      oldestPendingSeconds: 5,
    }).collectOutboxMetrics();
    expect(metrics.pending).toBeGreaterThanOrEqual(1);
    expect(metrics.processing).toBeGreaterThanOrEqual(1);
    expect(metrics.dead).toBeGreaterThanOrEqual(1);
    expect(metrics.oldestPendingAgeSeconds).toBeGreaterThanOrEqual(5);
    expect(metrics.alerts).toEqual(
      expect.arrayContaining(['BACKLOG_HIGH', 'DEAD_LETTER_PRESENT', 'OLDEST_PENDING_TOO_OLD']),
    );
    expect(JSON.stringify(metrics)).not.toContain('METRIC_PENDING');
    await prisma.outboxEvent.deleteMany({ where: { kitchenId: KITCHEN, eventType: 'TEST_EVENT' } });
  });

  it('keeps SecurityEvent outside the audit consumer boundary', async () => {
    const event = await prisma.outboxEvent.create({
      data: {
        kitchenId: KITCHEN,
        userId: USER,
        aggregateType: 'SecurityEvent',
        aggregateId: crypto.randomUUID(),
        eventType: 'LOGIN_FAILED',
        payload: { action: 'LOGIN_FAILED', resourceType: 'SecurityEvent' },
        availableAt: new Date(0),
      },
    });
    expect(await new OutboxProcessor(prisma, 1, KITCHEN).processOne()).toBe(false);
    const rejected = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(rejected.status).toBe('DEAD');
    expect(rejected.lastError).toBe('Error');
    expect(await prisma.auditLog.count({ where: { outboxEventId: event.id } })).toBe(0);
  });

});

function createEvent(
  prisma: PrismaClient,
  payload: object,
  data: { status?: 'PENDING' | 'PROCESSING' | 'DEAD'; createdAt?: Date } = {},
) {
  return prisma.outboxEvent.create({
    data: {
      kitchenId: KITCHEN,
      userId: USER,
      aggregateType: 'Test',
      aggregateId: crypto.randomUUID(),
      eventType: 'TEST_EVENT',
      payload,
      availableAt: new Date(0),
      ...data,
    },
  });
}

async function cleanup(prisma: PrismaClient) {
  const events = await prisma.outboxEvent.findMany({
    where: { kitchenId: KITCHEN },
    select: { id: true },
  });
  if (events.length)
    await prisma.consumerReceipt.deleteMany({
      where: { outboxEventId: { in: events.map(({ id }) => id) } },
    });
  await prisma.auditLog.deleteMany({ where: { OR: [{ kitchenId: KITCHEN }, { userId: USER }] } });
  await prisma.outboxEvent.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.idempotencyKey.deleteMany({ where: { userId: USER } });
  await prisma.kitchenStory.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.kitchenMember.deleteMany({ where: { kitchenId: KITCHEN } });
  await prisma.kitchen.deleteMany({ where: { id: KITCHEN } });
  await prisma.refreshToken.deleteMany({ where: { userId: USER } });
  await prisma.user.deleteMany({ where: { id: USER } });
}
