import { Prisma, type OutboxEvent } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export class BusinessEventConsumers {
  async consume(tx: Tx, event: OutboxEvent) {
    if (!(await this.belongsToKitchen(tx, event))) throw new Error('EventTenantMismatch');
    await this.once(tx, event, 'notifications', () => this.notifications(tx, event));
    await this.once(tx, event, 'love-letter-unlock', () => this.loveLetters(tx, event));
    await this.once(tx, event, 'achievements', () => this.achievements(tx, event));
    await this.once(tx, event, 'anniversary-reminders', () => this.anniversary(tx, event));
  }

  private async belongsToKitchen(tx: Tx, event: OutboxEvent) {
    if (!event.kitchenId)
      return ![
        'Dish',
        'MealLog',
        'LoveLetter',
        'Anniversary',
        'MealPreferenceSession',
      ].includes(event.aggregateType);
    if (event.aggregateType === 'Dish')
      return Boolean(
        await tx.dish.findFirst({
          where: { id: event.aggregateId, kitchenId: event.kitchenId },
          select: { id: true },
        }),
      );
    if (event.aggregateType === 'MealLog')
      return Boolean(
        await tx.mealLog.findFirst({
          where: { id: event.aggregateId, kitchenId: event.kitchenId },
          select: { id: true },
        }),
      );
    if (event.aggregateType === 'LoveLetter')
      return Boolean(
        await tx.loveLetter.findFirst({
          where: { id: event.aggregateId, kitchenId: event.kitchenId },
          select: { id: true },
        }),
      );
    if (event.aggregateType === 'Anniversary')
      return Boolean(
        await tx.anniversary.findFirst({
          where: { id: event.aggregateId, kitchenId: event.kitchenId },
          select: { id: true },
        }),
      );
    if (event.aggregateType === 'MealPreferenceSession')
      return Boolean(
        await tx.mealPreferenceSession.findFirst({
          where: { id: event.aggregateId, kitchenId: event.kitchenId },
          select: { id: true },
        }),
      );
    return true;
  }

  private async once(tx: Tx, event: OutboxEvent, consumer: string, work: () => Promise<void>) {
    if (
      await tx.consumerReceipt.findUnique({
        where: { outboxEventId_consumer: { outboxEventId: event.id, consumer } },
      })
    )
      return;
    await work();
    await tx.consumerReceipt.create({ data: { outboxEventId: event.id, consumer } });
  }

  private async notifications(tx: Tx, event: OutboxEvent) {
    if (!event.kitchenId) return;
    if (event.eventType === 'LOVE_LETTER_CREATED') {
      const letter = await tx.loveLetter.findFirst({
        where: { id: event.aggregateId, kitchenId: event.kitchenId, deletedAt: null },
        select: { recipientUserId: true },
      });
      if (letter)
        await this.notify(
          tx,
          event,
          letter.recipientUserId,
          'LOVE_LETTER_WAITING',
          '有一封情书在等待',
          '满足解锁条件后即可打开。',
        );
      return;
    }
    const messages: Record<string, [string, string, string]> = {
      DISH_CREATED: ['DISH_CREATED', '厨房有了新菜品', '去看看今天新增的菜品吧。'],
      MEAL_LOG_CREATED: ['MEAL_RECORDED', '共同用餐已记录', '一段新的用餐记忆已保存。'],
      PREFERENCE_REVEALED: ['PREFERENCE_REVEALED', '双方偏好已揭晓', '可以一起决定这顿吃什么了。'],
    };
    const message = messages[event.eventType];
    if (!message) return;
    const members = await tx.kitchenMember.findMany({
      where: {
        kitchenId: event.kitchenId,
        status: 'ACTIVE',
        ...(event.userId ? { userId: { not: event.userId } } : {}),
      },
      select: { userId: true },
    });
    await Promise.all(members.map(({ userId }) => this.notify(tx, event, userId, ...message)));
  }

  private async loveLetters(tx: Tx, event: OutboxEvent) {
    if (!event.kitchenId) return;
    if (event.eventType === 'LETTER_DATE_DUE') {
      const letter = await tx.loveLetter.findFirst({
        where: {
          id: event.aggregateId,
          kitchenId: event.kitchenId,
          deletedAt: null,
          unlockType: 'DATE',
          status: 'LOCKED',
          unlockAt: { lte: new Date() },
        },
      });
      if (
        letter &&
        (
          await tx.loveLetter.updateMany({
            where: { id: letter.id, kitchenId: event.kitchenId, status: 'LOCKED' },
            data: { status: 'UNLOCKED' },
          })
        ).count === 1
      )
        await this.notify(
          tx,
          event,
          letter.recipientUserId,
          'LOVE_LETTER_UNLOCKED',
          '情书已解锁',
          '一封等待中的情书现在可以打开了。',
          letter.id,
        );
      return;
    }
    if (!['DISH_CREATED', 'MEAL_LOG_CREATED'].includes(event.eventType)) return;
    const [dishCount, mealCount, letters] = await Promise.all([
      tx.dish.count({ where: { kitchenId: event.kitchenId, deletedAt: null, status: 'ACTIVE' } }),
      tx.mealLog.count({ where: { kitchenId: event.kitchenId } }),
      tx.loveLetter.findMany({
        where: {
          kitchenId: event.kitchenId,
          deletedAt: null,
          status: 'LOCKED',
          unlockType: event.eventType === 'DISH_CREATED' ? 'DISH_COUNT' : 'MEAL_COUNT',
        },
      }),
    ]);
    for (const letter of letters) {
      const ready =
        letter.unlockType === 'DISH_COUNT'
          ? dishCount >= (letter.unlockDishCount ?? Number.MAX_SAFE_INTEGER)
          : mealCount >= (letter.unlockMealCount ?? Number.MAX_SAFE_INTEGER);
      if (!ready) continue;
      if (
        (
          await tx.loveLetter.updateMany({
            where: { id: letter.id, kitchenId: event.kitchenId, status: 'LOCKED' },
            data: { status: 'UNLOCKED' },
          })
        ).count === 1
      )
        await this.notify(
          tx,
          event,
          letter.recipientUserId,
          'LOVE_LETTER_UNLOCKED',
          '情书已解锁',
          '一封等待中的情书现在可以打开了。',
          letter.id,
        );
    }
  }

  private async achievements(tx: Tx, event: OutboxEvent) {
    if (event.eventType !== 'DISH_CREATED' || !event.kitchenId) return;
    const count = await tx.dish.count({
      where: { kitchenId: event.kitchenId, deletedAt: null, status: 'ACTIVE' },
    });
    const definitions = await tx.achievementDefinition.findMany();
    for (const definition of definitions) {
      const criterion = definition.criterion as { type?: string; count?: number };
      const threshold =
        criterion.type === 'DISH_COUNT'
          ? criterion.count
          : definition.code === 'DISH_10'
            ? 10
            : undefined;
      if (threshold && count >= threshold)
        await tx.kitchenAchievement.upsert({
          where: {
            kitchenId_definitionId: { kitchenId: event.kitchenId, definitionId: definition.id },
          },
          create: {
            kitchenId: event.kitchenId,
            definitionId: definition.id,
            progress: count,
            unlockedAt: new Date(),
          },
          update: { progress: count },
        });
    }
  }

  private async anniversary(tx: Tx, event: OutboxEvent) {
    if (event.eventType !== 'ANNIVERSARY_REMINDER_DUE' || !event.kitchenId) return;
    const anniversary = await tx.anniversary.findFirst({
      where: { id: event.aggregateId, kitchenId: event.kitchenId },
    });
    if (!anniversary) return;
    const members = await tx.kitchenMember.findMany({
      where: { kitchenId: event.kitchenId, status: 'ACTIVE' },
      select: { userId: true },
    });
    await Promise.all(
      members.map(({ userId }) =>
        this.notify(
          tx,
          event,
          userId,
          'ANNIVERSARY_REMINDER',
          '纪念日提醒',
          `今天是「${anniversary.name.slice(0, 40)}」纪念日。`,
          anniversary.id,
        ),
      ),
    );
  }

  private async notify(
    tx: Tx,
    event: OutboxEvent,
    userId: string,
    type: string,
    title: string,
    content: string,
    suffix = event.aggregateId,
  ) {
    if (!event.kitchenId) return;
    const sourceKey = `${event.id}:${suffix}`;
    await tx.notification.upsert({
      where: { userId_type_sourceKey: { userId, type, sourceKey } },
      create: {
        kitchenId: event.kitchenId,
        userId,
        type,
        title,
        content,
        sourceEventId: event.id,
        sourceKey,
      },
      update: {},
    });
  }
}
