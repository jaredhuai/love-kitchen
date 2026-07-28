import { Inject, Injectable } from '@nestjs/common';
import { enqueueAudit } from '../../../infra/outbox/enqueue-audit';
import { PrismaService } from '../../../infra/prisma.service';

@Injectable()
export class AiRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listDishes(kitchenId: string) {
    return this.prisma.dish.findMany({
      where: { kitchenId, deletedAt: null, status: 'ACTIVE' },
      select: { name: true, category: true, cuisine: true, caloriesPerServing: true, tags: true },
      take: 30,
    });
  }

  persistRecommendation(kitchenId: string, userId: string, result: unknown) {
    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.aIConversation.create({
        data: {
          kitchenId,
          userId,
          purpose: 'RECOMMENDATION',
          title: '菜品推荐',
          messages: { create: { kitchenId, role: 'assistant', content: result as never } },
        },
      });
      await enqueueAudit(tx, {
        kitchenId,
        userId,
        aggregateType: 'AIConversation',
        aggregateId: conversation.id,
        eventType: 'AI_RECOMMENDATION_CREATED',
        resourceId: conversation.id,
      });
      return conversation;
    });
  }

  listLegacy(kitchenId: string, userId: string) {
    return this.prisma.aIConversation.findMany({
      where: { kitchenId, userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  listCursor(
    kitchenId: string,
    userId: string,
    limit: number,
    cursor?: { createdAt: Date; id: string },
  ) {
    return this.prisma.aIConversation.findMany({
      where: {
        kitchenId,
        userId,
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
    });
  }

  getConversation(kitchenId: string, userId: string, id: string) {
    return this.prisma.aIConversation.findFirst({
      where: { id, kitchenId, userId },
      include: {
        messages: { where: { kitchenId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    });
  }
}
