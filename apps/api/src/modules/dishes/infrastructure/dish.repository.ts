import { BadRequestException, Inject, Injectable } from '@nestjs/common';
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
        images: { orderBy: { sortOrder: 'asc' as const } },
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
        images: { orderBy: { sortOrder: 'asc' as const } },
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
        images: { orderBy: { sortOrder: 'asc' as const } },
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
    const imageUploadIds = [...new Set(dto.imageUploadIds ?? [])];
    await this.requireUploads(tx, kitchenId, imageUploadIds);
    const dish = await tx.dish.create({
      data: {
        kitchenId,
        createdBy: userId,
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category ?? 'OTHER',
        cuisine: dto.cuisine ?? null,
        notes: dto.notes ?? null,
        story: dto.story ?? null,
        kind: dto.kind ?? 'PERMANENT',
        effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : null,
        servings: dto.servings ?? 2,
        coverImageUrl: imageUploadIds[0] ?? dto.coverImageUrl ?? null,
        isFavorite: dto.isFavorite ?? false,
        tags: [],
      },
    });
    if (imageUploadIds.length) {
      await tx.dishImage.createMany({
        data: imageUploadIds.map((uploadId, sortOrder) => ({
          kitchenId,
          dishId: dish.id,
          uploadId,
          sortOrder,
          isCover: sortOrder === 0,
        })),
      });
    }
    if (dto.kind === 'TEMPORARY' && dto.effectiveDate && dto.temporaryMealType) {
      const mealDate = new Date(dto.effectiveDate);
      const weekStart = new Date(mealDate);
      weekStart.setHours(0, 0, 0, 0);
      const group = await tx.mealPlanGroup.upsert({
        where: { kitchenId_weekStart: { kitchenId, weekStart } },
        create: { kitchenId, weekStart, createdBy: userId, title: '临时菜单' },
        update: {},
      });
      await tx.mealPlan.create({
        data: {
          kitchenId,
          groupId: group.id,
          createdBy: userId,
          mealDate,
          mealType: dto.temporaryMealType,
          dishId: dish.id,
          servings: dto.servings ?? 2,
        },
      });
    }
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
  updateWithImages(
    kitchenId: string,
    id: string,
    data: object,
    imageUploadIds?: string[],
    temporarySchedule?: { effectiveDate: Date; mealType: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.dish.findFirst({
        where: { id, kitchenId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!current) return { count: 0 };
      const uploads = imageUploadIds === undefined ? undefined : [...new Set(imageUploadIds)];
      if (uploads) {
        await this.requireUploads(tx, kitchenId, uploads);
        await tx.dishImage.deleteMany({ where: { dishId: id, kitchenId } });
        if (uploads.length) {
          await tx.dishImage.createMany({
            data: uploads.map((uploadId, sortOrder) => ({
              kitchenId,
              dishId: id,
              uploadId,
              sortOrder,
              isCover: sortOrder === 0,
            })),
          });
        }
      }
      await tx.dish.update({
        where: { id },
        data: {
          ...data,
          ...(uploads ? { coverImageUrl: uploads[0] ?? null } : {}),
        },
      });
      if (temporarySchedule) {
        await tx.mealPlan.updateMany({
          where: { kitchenId, dishId: id },
          data: { mealDate: temporarySchedule.effectiveDate, mealType: temporarySchedule.mealType },
        });
      }
      return { count: 1 };
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

  private async requireUploads(
    tx: Prisma.TransactionClient,
    kitchenId: string,
    uploadIds: string[],
  ) {
    if (!uploadIds.length) return;
    const count = await tx.uploadFile.count({
      where: { id: { in: uploadIds }, kitchenId, deletedAt: null, status: 'ACTIVE' },
    });
    if (count !== uploadIds.length) throw new BadRequestException('菜品图片不存在或不属于当前厨房');
  }
}
type DishDtoLike = {
  name: string;
  description?: string;
  notes?: string;
  story?: string;
  category?: 'MEAT' | 'VEGETABLE' | 'SOUP_PORRIDGE' | 'DESSERT_SNACK' | 'WESTERN' | 'SEAFOOD' | 'DRINK' | 'STAPLE' | 'OTHER';
  kind?: 'PERMANENT' | 'TEMPORARY';
  effectiveDate?: string;
  temporaryMealType?: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
  cuisine?: string;
  servings?: number;
  coverImageUrl?: string;
  imageUploadIds?: string[];
  isFavorite?: boolean;
};
type ReviewLike = {
  tasteRating: number;
  appearanceRating: number;
  careRating: number;
  content?: string;
  eatAgain?: boolean;
};
