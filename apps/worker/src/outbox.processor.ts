import { OutboxStatus, Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { BusinessEventConsumers } from './business-event.consumers';

const AuditPayload = z
  .object({
    action: z.string().min(1).max(100),
    resourceType: z.string().min(1).max(100),
    resourceId: z.string().uuid().optional(),
  })
  .strict();

export class OutboxProcessor {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly maxAttempts = 5,
    private readonly scopeKitchenId?: string,
    private readonly leaseMs = 5 * 60_000,
    private readonly consumers = new BusinessEventConsumers(),
  ) {}

  async processOne() {
    const event = await this.claim();
    if (!event) return false;
    try {
      if (event.aggregateType === 'SecurityEvent')
        throw new Error('UnsupportedSecurityEventBoundary');
      const payload = AuditPayload.parse(event.payload);
      await this.prisma.$transaction(async (tx) => {
        await this.consumers.consume(tx, event);
        await tx.auditLog.upsert({
          where: { outboxEventId: event.id },
          create: {
            outboxEventId: event.id,
            kitchenId: event.kitchenId,
            userId: event.userId,
            action: payload.action,
            resourceType: payload.resourceType,
            resourceId: payload.resourceId ?? null,
            requestId: `outbox:${event.id}`,
            metadata: { eventType: event.eventType },
          },
          update: {},
        });
        await tx.outboxEvent.update({
          where: { id: event.id },
          data: { status: OutboxStatus.PROCESSED, processedAt: new Date(), lastError: null },
        });
      });
      return true;
    } catch (error) {
      const attempts = event.attempts + 1;
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: attempts >= this.maxAttempts ? OutboxStatus.DEAD : OutboxStatus.PENDING,
          attempts,
          availableAt: new Date(Date.now() + Math.min(60_000, 2 ** attempts * 1_000)),
          lastError: this.safeError(error),
        },
      });
      return false;
    }
  }

  private claim() {
    return this.prisma.$transaction(async (tx) => {
      await tx.outboxEvent.updateMany({
        where: { status: OutboxStatus.PROCESSING, availableAt: { lte: new Date() } },
        data: { status: OutboxStatus.PENDING },
      });
      const scope = this.scopeKitchenId
        ? Prisma.sql`AND "kitchenId" = ${this.scopeKitchenId}::uuid`
        : Prisma.empty;
      const candidates = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "OutboxEvent"
        WHERE "status" = 'PENDING' AND "availableAt" <= NOW()
        ${scope}
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED LIMIT 1
      `);
      const id = candidates[0]?.id;
      if (!id) return null;
      return tx.outboxEvent.update({
        where: { id },
        data: { status: OutboxStatus.PROCESSING, availableAt: new Date(Date.now() + this.leaseMs) },
      });
    });
  }

  private safeError(error: unknown) {
    const name = error instanceof Error ? error.name : 'UnknownError';
    return name.slice(0, 200);
  }
}
