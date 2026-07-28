import { OutboxStatus, Prisma, PrismaClient } from '@prisma/client';

export type OutboxMetrics = {
  pending: number;
  processing: number;
  dead: number;
  oldestPendingAgeSeconds: number;
  alerts: Array<'BACKLOG_HIGH' | 'DEAD_LETTER_PRESENT' | 'OLDEST_PENDING_TOO_OLD'>;
  measuredAt: string;
};

export class WorkerMaintenance {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly thresholds = { backlog: 1_000, dead: 1, oldestPendingSeconds: 300 },
    private readonly reminderTimezone = 'Australia/Sydney',
  ) {}

  async cleanupExpiredIdempotencyKeys(now = new Date(), batchSize = 1_000) {
    const expired = await this.prisma.idempotencyKey.findMany({
      where: { expiresAt: { lt: now } },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: batchSize,
    });
    if (expired.length === 0) return 0;
    const result = await this.prisma.idempotencyKey.deleteMany({
      where: { id: { in: expired.map(({ id }) => id) }, expiresAt: { lt: now } },
    });
    return result.count;
  }

  async collectOutboxMetrics(now = new Date()): Promise<OutboxMetrics> {
    const [pending, processing, dead, oldest] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { status: OutboxStatus.PENDING } }),
      this.prisma.outboxEvent.count({ where: { status: OutboxStatus.PROCESSING } }),
      this.prisma.outboxEvent.count({ where: { status: OutboxStatus.DEAD } }),
      this.prisma.outboxEvent.findFirst({
        where: { status: OutboxStatus.PENDING },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    const oldestPendingAgeSeconds = oldest
      ? Math.max(0, Math.floor((now.getTime() - oldest.createdAt.getTime()) / 1_000))
      : 0;
    const alerts: OutboxMetrics['alerts'] = [];
    if (pending >= this.thresholds.backlog && this.thresholds.backlog > 0)
      alerts.push('BACKLOG_HIGH');
    if (dead >= this.thresholds.dead && this.thresholds.dead > 0)
      alerts.push('DEAD_LETTER_PRESENT');
    if (
      oldestPendingAgeSeconds >= this.thresholds.oldestPendingSeconds &&
      this.thresholds.oldestPendingSeconds > 0
    )
      alerts.push('OLDEST_PENDING_TOO_OLD');
    return {
      pending,
      processing,
      dead,
      oldestPendingAgeSeconds,
      alerts,
      measuredAt: now.toISOString(),
    };
  }

  async enqueueDueDomainEvents(now = new Date()) {
    const day = this.localDay(now);
    const [letters, anniversaries] = await Promise.all([
      this.prisma.loveLetter.findMany({
        where: { unlockType: 'DATE', status: 'LOCKED', deletedAt: null, unlockAt: { lte: now } },
        select: { id: true, kitchenId: true, createdBy: true },
      }),
      this.prisma.anniversary.findMany({
        select: { id: true, kitchenId: true, createdBy: true, date: true, repeatsYearly: true },
      }),
    ]);
    let enqueued = 0;
    for (const letter of letters) {
      const dedupeKey = `letter-date:${letter.id}`;
      try {
        await this.prisma.outboxEvent.create({
          data: {
            kitchenId: letter.kitchenId,
            userId: letter.createdBy,
            aggregateType: 'LoveLetter',
            aggregateId: letter.id,
            eventType: 'LETTER_DATE_DUE',
            dedupeKey,
            payload: {
              action: 'LETTER_DATE_DUE',
              resourceType: 'LoveLetter',
              resourceId: letter.id,
            },
          },
        });
        enqueued += 1;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
          throw error;
      }
    }
    for (const anniversary of anniversaries) {
      const date = anniversary.date.toISOString().slice(0, 10);
      const due = anniversary.repeatsYearly ? date.slice(5) === day.slice(5) : date === day;
      if (!due) continue;
      const dedupeKey = `anniversary:${anniversary.id}:${day}`;
      try {
        await this.prisma.outboxEvent.create({
          data: {
            kitchenId: anniversary.kitchenId,
            userId: anniversary.createdBy,
            aggregateType: 'Anniversary',
            aggregateId: anniversary.id,
            eventType: 'ANNIVERSARY_REMINDER_DUE',
            dedupeKey,
            payload: {
              action: 'ANNIVERSARY_REMINDER_DUE',
              resourceType: 'Anniversary',
              resourceId: anniversary.id,
            },
          },
        });
        enqueued += 1;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
          throw error;
      }
    }
    return enqueued;
  }

  private localDay(date: Date) {
    const parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: this.reminderTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${value.year}-${value.month}-${value.day}`;
  }
}
