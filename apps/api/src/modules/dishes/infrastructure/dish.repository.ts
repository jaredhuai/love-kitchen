import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';
import type { Prisma } from '@prisma/client';
import { enqueueAudit } from '../../../infra/outbox/enqueue-audit';
@Injectable()
export class DishRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  listOffset(kitchenId: string, skip: number, take: number) {
    return this.prisma.dish.findMany({
      where: { kitchenId, deletedAt: null, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        reviews: true,
        ingredients: { orderBy: { sortOrder: 'asc' as const } },
        steps: { orderBy: { stepNo: 'asc' as const } },
      },
    });
  }
  listCursor(kitchenId: string, limit: number, cursor?: { createdAt: Date; id: string }) {
    return this.prisma.dish.findMany({
      where: {
        kitchenId,
        deletedAt: null,
        status: 'ACTIVE',
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        reviews: true,
        ingredients: { orderBy: { sortOrder: 'asc' as const } },
        steps: { orderBy: { stepNo: 'asc' as const } },
      },
    });
  }
  get(kitchenId: string, id: string) {
    return this.prisma.dish.findFirst({
      where: { id, kitchenId, deletedAt: null },
      include: {
        ingredients: { orderBy: { sortOrder: 'asc' as const } },
        steps: { orderBy: { stepNo: 'asc' as const } },
        reviews: true,
      },
    });
  }
  create(kitchenId: string, userId: string, dto: DishDtoLike) {
    return this.prisma.$transaction((tx) => this.createInTransaction(tx, kitchenId, userId, dto));
  }
  async createInTransaction(
    tx: Prisma.TransactionClient,
    kitchenId: string,
    userId: string,
    dto: DishDtoLike,
  ) {
    const dish = await tx.dish.create({
      data: {
        kitchenId,
        createdBy: userId,
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category ?? null,
        cuisine: dto.cuisine ?? null,
        servings: dto.servings ?? 2,
        coverImageUrl: dto.coverImageUrl ?? null,
        isFavorite: dto.isFavorite ?? false,
        tags: [],
      },
    });
    await enqueueAudit(tx, {
      kitchenId,
      userId,
      aggregateType: 'Dish',
      aggregateId: dish.id,
      eventType: 'DISH_CREATED',
      resourceId: dish.id,
    });
    return dish;
  }
  update(kitchenId: string, id: string, data: object) {
    return this.prisma.dish.updateMany({
      where: { id, kitchenId, deletedAt: null, status: 'ACTIVE' },
      data,
    });
  }
  remove(kitchenId: string, id: string) {
    return this.prisma.dish.updateMany({
      where: { id, kitchenId, deletedAt: null },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });
  }
  review(kitchenId: string, dishId: string, userId: string, dto: ReviewLike) {
    return this.prisma.dishReview.upsert({
      where: { dishId_userId: { dishId, userId } },
      create: {
        kitchenId,
        dishId,
        userId,
        tasteRating: dto.tasteRating,
        appearanceRating: dto.appearanceRating,
        careRating: dto.careRating,
        content: dto.content ?? null,
        eatAgain: dto.eatAgain ?? true,
      },
      update: {
        tasteRating: dto.tasteRating,
        appearanceRating: dto.appearanceRating,
        careRating: dto.careRating,
        content: dto.content ?? null,
        eatAgain: dto.eatAgain ?? true,
      },
    });
  }
}
type DishDtoLike = {
  name: string;
  description?: string;
  category?: string;
  cuisine?: string;
  servings?: number;
  coverImageUrl?: string;
  isFavorite?: boolean;
};
type ReviewLike = {
  tasteRating: number;
  appearanceRating: number;
  careRating: number;
  content?: string;
  eatAgain?: boolean;
};
