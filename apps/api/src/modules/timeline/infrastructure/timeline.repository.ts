import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma.service';

type TimelineInput = { title: string; eventType: string; eventDate: string; description?: string };

@Injectable()
export class TimelineRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listLegacy(kitchenId: string) {
    const rows = await this.prisma.timelineEvent.findMany({ where: { kitchenId }, orderBy: [{ eventDate: 'desc' }, { id: 'desc' }] });
    return this.withAuthorNames(kitchenId, rows);
  }

  async listCursor(kitchenId: string, limit: number, cursor?: { eventDate: Date; id: string }) {
    const rows = await this.prisma.timelineEvent.findMany({
      where: { kitchenId, ...(cursor ? { OR: [{ eventDate: { lt: cursor.eventDate } }, { eventDate: cursor.eventDate, id: { lt: cursor.id } }] } : {}) },
      orderBy: [{ eventDate: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return this.withAuthorNames(kitchenId, rows);
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

  private async withAuthorNames<T extends { createdBy: string | null }>(kitchenId: string, rows: T[]) {
    const ids = [...new Set(rows.flatMap((row) => row.createdBy ? [row.createdBy] : []))];
    const members = await this.prisma.kitchenMember.findMany({
      where: { kitchenId, userId: { in: ids }, status: 'ACTIVE' },
      select: { userId: true, role: true },
    });
    const names = new Map(members.map((member) => [member.userId, member.role === 'OWNER' ? '德德' : '桐桐']));
    return rows.map((row) => ({ ...row, createdByName: row.createdBy ? names.get(row.createdBy) ?? '厨房成员' : '系统' }));
  }
}
