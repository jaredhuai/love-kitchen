import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma.service';

type TimelineInput = { title: string; eventType: string; eventDate: string; description?: string };

@Injectable()
export class TimelineRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listLegacy(kitchenId: string) {
    return this.prisma.timelineEvent.findMany({ where: { kitchenId }, orderBy: [{ eventDate: 'desc' }, { id: 'desc' }] });
  }

  listCursor(kitchenId: string, limit: number, cursor?: { eventDate: Date; id: string }) {
    return this.prisma.timelineEvent.findMany({
      where: { kitchenId, ...(cursor ? { OR: [{ eventDate: { lt: cursor.eventDate } }, { eventDate: cursor.eventDate, id: { lt: cursor.id } }] } : {}) },
      orderBy: [{ eventDate: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  }

  create(kitchenId: string, userId: string, dto: TimelineInput) {
    return this.prisma.timelineEvent.create({ data: this.createData(kitchenId, userId, dto) });
  }

  createInTransaction(tx: Prisma.TransactionClient, kitchenId: string, userId: string, dto: TimelineInput) {
    return tx.timelineEvent.create({ data: this.createData(kitchenId, userId, dto) });
  }

  private createData(kitchenId: string, userId: string, dto: TimelineInput) {
    return { kitchenId, createdBy: userId, title: dto.title, eventType: dto.eventType, eventDate: new Date(dto.eventDate), description: dto.description ?? null, generatedBySystem: false };
  }
}
