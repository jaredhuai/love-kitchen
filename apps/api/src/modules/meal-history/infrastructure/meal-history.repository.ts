import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { enqueueAudit } from '../../../infra/outbox/enqueue-audit';
import { PrismaService } from '../../../infra/prisma.service';
import { KitchenResourcePolicy } from '../../../security/kitchen-resource.policy';

type MealLogInput = { eatenAt: string; mealType: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK'; mealPlanId?: string; dishId?: string; servings: number; eaterUserIds?: string[]; cookedBy?: string };

@Injectable()
export class MealHistoryRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(KitchenResourcePolicy) private readonly resources: KitchenResourcePolicy) {}

  listLegacy(kitchenId: string) {
    return this.prisma.mealLog.findMany({ where: { kitchenId }, orderBy: [{ eatenAt: 'desc' }, { id: 'desc' }] });
  }

  listCursor(kitchenId: string, limit: number, cursor?: { eatenAt: Date; id: string }) {
    return this.prisma.mealLog.findMany({
      where: { kitchenId, ...(cursor ? { OR: [{ eatenAt: { lt: cursor.eatenAt } }, { eatenAt: cursor.eatenAt, id: { lt: cursor.id } }] } : {}) },
      orderBy: [{ eatenAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  }

  create(kitchenId: string, userId: string, dto: MealLogInput) {
    return this.prisma.$transaction((tx) => this.createInTransaction(tx, kitchenId, userId, dto));
  }

  async createInTransaction(tx: Prisma.TransactionClient, kitchenId: string, userId: string, dto: MealLogInput) {
    if (dto.mealPlanId) await this.resources.requireMealPlan(tx, kitchenId, dto.mealPlanId);
    if (dto.dishId) await this.resources.requireDish(tx, kitchenId, dto.dishId);
    const eaterUserIds = dto.eaterUserIds?.length ? [...new Set(dto.eaterUserIds)] : [userId];
    await this.resources.requireActiveMembers(tx, kitchenId, [...eaterUserIds, dto.cookedBy]);
    const log = await tx.mealLog.create({ data: { kitchenId, createdBy: userId, mealPlanId: dto.mealPlanId ?? null, eatenAt: new Date(dto.eatenAt), mealType: dto.mealType, dishId: dto.dishId ?? null, servings: dto.servings, eaterUserIds, cookedBy: dto.cookedBy ?? null, wasPlanned: !!dto.mealPlanId, imageUrls: [] } });
    await enqueueAudit(tx, { kitchenId, userId, aggregateType: 'MealLog', aggregateId: log.id, eventType: 'MEAL_LOG_CREATED', resourceId: log.id });
    return log;
  }
}
