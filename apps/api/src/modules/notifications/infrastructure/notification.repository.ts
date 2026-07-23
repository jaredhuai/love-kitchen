import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';

@Injectable()
export class NotificationRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listLegacy(kitchenId: string, userId: string) {
    return this.prisma.notification.findMany({ where: { kitchenId, userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  }

  listCursor(kitchenId: string, userId: string, limit: number, cursor?: { createdAt: Date; id: string }) {
    return this.prisma.notification.findMany({
      where: { kitchenId, userId, ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  }

  markRead(kitchenId: string, userId: string, id: string) {
    return this.prisma.notification.updateMany({ where: { id, kitchenId, userId }, data: { readAt: new Date() } });
  }

  get(kitchenId: string, userId: string, id: string) {
    return this.prisma.notification.findFirst({ where: { id, kitchenId, userId } });
  }
}
