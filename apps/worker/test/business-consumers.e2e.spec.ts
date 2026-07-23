import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OutboxProcessor } from '../src/outbox.processor';
import { WorkerMaintenance } from '../src/worker.maintenance';

const KITCHEN_A = '7a000000-0000-4000-8000-000000000001';
const KITCHEN_B = '7a000000-0000-4000-8000-000000000002';
const USER_A = '7a000000-0000-4000-8000-000000000011';
const USER_B = '7a000000-0000-4000-8000-000000000012';

describe('Business Outbox consumers (real PostgreSQL)', () => {
  let prisma: PrismaClient;
  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    await cleanup(prisma);
    await prisma.user.createMany({
      data: [
        { id: USER_A, devKey: 'consumer-a', nickname: 'A' },
        { id: USER_B, devKey: 'consumer-b', nickname: 'B' },
      ],
    });
    await prisma.kitchen.createMany({
      data: [
        { id: KITCHEN_A, name: 'Consumer A', createdBy: USER_A },
        { id: KITCHEN_B, name: 'Consumer B', createdBy: USER_B },
      ],
    });
    await prisma.kitchenMember.createMany({
      data: [
        { kitchenId: KITCHEN_A, userId: USER_A, role: 'OWNER' },
        { kitchenId: KITCHEN_A, userId: USER_B, role: 'MEMBER' },
        { kitchenId: KITCHEN_B, userId: USER_B, role: 'OWNER' },
      ],
    });
  });
  beforeEach(async () => {
    await cleanupReceipts(prisma);
    await prisma.notification.deleteMany({ where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] } } });
    await prisma.auditLog.deleteMany({ where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] } } });
    await prisma.outboxEvent.deleteMany({ where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] } } });
    await prisma.kitchenAchievement.deleteMany({
      where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] } },
    });
    await prisma.loveLetter.deleteMany({ where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] } } });
    await prisma.mealLog.deleteMany({ where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] } } });
    await prisma.dish.deleteMany({ where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] } } });
    await prisma.anniversary.deleteMany({ where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] } } });
    await prisma.achievementDefinition.deleteMany({ where: { code: { startsWith: 'CONSUMER_' } } });
  });
  afterAll(async () => {
    if (prisma) await cleanup(prisma);
    if (prisma) await prisma.$disconnect();
  });

  it('unlocks count-based letters and creates notifications exactly once under replay', async () => {
    const letter = await prisma.loveLetter.create({
      data: {
        kitchenId: KITCHEN_A,
        title: 'private title',
        encryptedContent: 'private-ciphertext',
        createdBy: USER_A,
        recipientUserId: USER_B,
        unlockType: 'MEAL_COUNT',
        unlockMealCount: 1,
      },
    });
    const meal = await prisma.mealLog.create({
      data: {
        kitchenId: KITCHEN_A,
        eatenAt: new Date(),
        mealType: 'DINNER',
        servings: 2,
        eaterUserIds: [USER_A, USER_B],
        imageUrls: [],
        createdBy: USER_A,
      },
    });
    const event = await createEvent(
      prisma,
      KITCHEN_A,
      USER_A,
      'MealLog',
      meal.id,
      'MEAL_LOG_CREATED',
    );
    const processor = new OutboxProcessor(prisma, 5, KITCHEN_A);
    expect(await processor.processOne()).toBe(true);
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: 'PENDING', availableAt: new Date(0), processedAt: null },
    });
    expect(await processor.processOne()).toBe(true);
    expect((await prisma.loveLetter.findUniqueOrThrow({ where: { id: letter.id } })).status).toBe(
      'UNLOCKED',
    );
    expect(
      await prisma.notification.count({ where: { kitchenId: KITCHEN_A, userId: USER_B } }),
    ).toBe(2);
    expect(await prisma.consumerReceipt.count({ where: { outboxEventId: event.id } })).toBe(4);
    const serialized = JSON.stringify(
      await prisma.notification.findMany({ where: { sourceEventId: event.id } }),
    );
    expect(serialized).not.toContain('private title');
    expect(serialized).not.toContain('private-ciphertext');
  });

  it('rejects a forged cross-kitchen aggregate without side effects', async () => {
    const meal = await prisma.mealLog.create({
      data: {
        kitchenId: KITCHEN_A,
        eatenAt: new Date(),
        mealType: 'DINNER',
        servings: 2,
        eaterUserIds: [USER_A],
        imageUrls: [],
        createdBy: USER_A,
      },
    });
    const event = await createEvent(
      prisma,
      KITCHEN_B,
      USER_B,
      'MealLog',
      meal.id,
      'MEAL_LOG_CREATED',
    );
    expect(await new OutboxProcessor(prisma, 1, KITCHEN_B).processOne()).toBe(false);
    expect(
      await prisma.outboxEvent.findUnique({
        where: { id: event.id },
        select: { status: true, lastError: true },
      }),
    ).toEqual({ status: 'DEAD', lastError: 'Error' });
    expect(await prisma.notification.count({ where: { sourceEventId: event.id } })).toBe(0);
  });

  it('unlocks achievements idempotently from dish events', async () => {
    const definition = await prisma.achievementDefinition.create({
      data: {
        code: 'CONSUMER_DISH_1',
        name: '第一道菜',
        description: '创建一道菜',
        criterion: { type: 'DISH_COUNT', count: 1 },
      },
    });
    const dish = await prisma.dish.create({
      data: {
        kitchenId: KITCHEN_A,
        name: '第一道菜',
        servings: 2,
        tags: [],
        sourceType: 'MANUAL',
        createdBy: USER_A,
      },
    });
    const event = await createEvent(prisma, KITCHEN_A, USER_A, 'Dish', dish.id, 'DISH_CREATED');
    const processor = new OutboxProcessor(prisma, 5, KITCHEN_A);
    await processor.processOne();
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: 'PENDING', availableAt: new Date(0) },
    });
    await processor.processOne();
    expect(
      await prisma.kitchenAchievement.findMany({
        where: { kitchenId: KITCHEN_A, definitionId: definition.id },
      }),
    ).toHaveLength(1);
  });

  it('schedules date-letter and anniversary events idempotently and consumes them safely', async () => {
    const now = new Date('2026-07-20T12:00:00Z');
    const letter = await prisma.loveLetter.create({
      data: {
        kitchenId: KITCHEN_A,
        title: 'date letter',
        encryptedContent: 'secret',
        createdBy: USER_A,
        recipientUserId: USER_B,
        unlockType: 'DATE',
        unlockAt: new Date(0),
      },
    });
    await prisma.anniversary.create({
      data: {
        kitchenId: KITCHEN_A,
        type: 'FIRST_MEAL',
        name: '我们的纪念日',
        date: new Date('2020-07-20'),
        repeatsYearly: true,
        createdBy: USER_A,
      },
    });
    const maintenance = new WorkerMaintenance(prisma);
    expect(await maintenance.enqueueDueDomainEvents(now)).toBe(2);
    expect(await maintenance.enqueueDueDomainEvents(now)).toBe(0);
    const processor = new OutboxProcessor(prisma, 5, KITCHEN_A);
    while (await processor.processOne()) {
      /* drain scheduled events */
    }
    expect((await prisma.loveLetter.findUniqueOrThrow({ where: { id: letter.id } })).status).toBe(
      'UNLOCKED',
    );
    expect(
      await prisma.notification.count({
        where: { kitchenId: KITCHEN_A, type: 'ANNIVERSARY_REMINDER' },
      }),
    ).toBe(2);
    expect(
      await prisma.notification.count({
        where: { kitchenId: KITCHEN_A, type: 'LOVE_LETTER_UNLOCKED', userId: USER_B },
      }),
    ).toBe(1);
  });
});

function createEvent(
  prisma: PrismaClient,
  kitchenId: string,
  userId: string,
  aggregateType: string,
  aggregateId: string,
  eventType: string,
) {
  return prisma.outboxEvent.create({
    data: {
      kitchenId,
      userId,
      aggregateType,
      aggregateId,
      eventType,
      availableAt: new Date(0),
      payload: { action: eventType, resourceType: aggregateType, resourceId: aggregateId },
    },
  });
}

async function cleanup(prisma: PrismaClient) {
  await cleanupReceipts(prisma);
  await prisma.notification.deleteMany({ where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] } } });
  await prisma.auditLog.deleteMany({ where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] } } });
  await prisma.outboxEvent.deleteMany({ where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] } } });
  await prisma.kitchenAchievement.deleteMany({
    where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] } },
  });
  await prisma.loveLetter.deleteMany({ where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] } } });
  await prisma.mealLog.deleteMany({ where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] } } });
  await prisma.dish.deleteMany({ where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] } } });
  await prisma.anniversary.deleteMany({ where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] } } });
  await prisma.achievementDefinition.deleteMany({ where: { code: { startsWith: 'CONSUMER_' } } });
  await prisma.refreshTokenSession.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
  await prisma.kitchenMember.deleteMany({ where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] } } });
  await prisma.kitchen.deleteMany({ where: { id: { in: [KITCHEN_A, KITCHEN_B] } } });
  await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
}

async function cleanupReceipts(prisma: PrismaClient) {
  const events = await prisma.outboxEvent.findMany({
    where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] } },
    select: { id: true },
  });
  if (events.length)
    await prisma.consumerReceipt.deleteMany({
      where: { outboxEventId: { in: events.map(({ id }) => id) } },
    });
}
