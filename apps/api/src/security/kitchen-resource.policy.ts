import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

@Injectable()
export class KitchenResourcePolicy {
  async requireDish(
    tx: Prisma.TransactionClient,
    kitchenId: string,
    dishId: string,
  ) {
    const dish = await tx.dish.findFirst({
      where: {
        id: dishId,
        kitchenId,
        deletedAt: null,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (!dish) throw new NotFoundException('关联资源不存在');
    return dish;
  }

  async requireMealPlan(
    tx: Prisma.TransactionClient,
    kitchenId: string,
    mealPlanId: string,
  ) {
    const plan = await tx.mealPlan.findFirst({
      where: { id: mealPlanId, kitchenId },
      select: { id: true, dishId: true },
    });

    if (!plan) throw new NotFoundException('关联资源不存在');
    return plan;
  }

  async requireActiveMembers(
    tx: Prisma.TransactionClient,
    kitchenId: string,
    userIds: Array<string | null | undefined>,
  ) {
    const requested = [...new Set(userIds.filter((id): id is string => !!id))];
    if (requested.length === 0) return;

    const members = await tx.kitchenMember.findMany({
      where: {
        kitchenId,
        userId: { in: requested },
        status: 'ACTIVE',
        kitchen: { deletedAt: null },
      },
      select: { userId: true },
    });

    if (members.length !== requested.length) {
      throw new NotFoundException('关联资源不存在');
    }
  }
}
