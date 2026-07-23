import type { Prisma } from '@prisma/client';

type AuditEvent = {
  kitchenId?: string | null;
  userId?: string | null;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  resourceId?: string;
};

export function enqueueAudit(tx: Prisma.TransactionClient, event: AuditEvent) {
  return tx.outboxEvent.create({
    data: {
      kitchenId: event.kitchenId ?? null,
      userId: event.userId ?? null,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: {
        action: event.eventType,
        resourceType: event.aggregateType,
        ...(event.resourceId ? { resourceId: event.resourceId } : {}),
      },
    },
  });
}
