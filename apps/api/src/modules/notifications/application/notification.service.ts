import { Inject, Injectable } from '@nestjs/common';
import { invalidNotificationCursor, notificationNotFound } from '../domain/notification.errors';
import { NotificationRepository } from '../infrastructure/notification.repository';

@Injectable()
export class NotificationService {
  constructor(@Inject(NotificationRepository) private readonly repository: NotificationRepository) {}

  list(kitchenId: string, userId: string) { return this.repository.listLegacy(kitchenId, userId); }

  async listV2(kitchenId: string, userId: string, limit = 20, rawCursor?: string) {
    const pageSize = Math.min(Math.max(Number(limit), 1), 50);
    const cursor = rawCursor ? this.decodeCursor(rawCursor) : undefined;
    const rows = await this.repository.listCursor(kitchenId, userId, pageSize, cursor);
    const hasNextPage = rows.length > pageSize;
    const items = rows.slice(0, pageSize);
    const last = items.at(-1);
    return { items, pageInfo: { nextCursor: hasNextPage && last ? this.encodeCursor(last.createdAt, last.id) : null, hasNextPage } };
  }

  async markRead(kitchenId: string, userId: string, id: string) {
    const result = await this.repository.markRead(kitchenId, userId, id);
    if (result.count !== 1) throw notificationNotFound();
    return this.repository.get(kitchenId, userId, id);
  }

  private encodeCursor(createdAt: Date, id: string) { return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString('base64url'); }
  private decodeCursor(value: string) {
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { createdAt?: string; id?: string };
      const createdAt = new Date(parsed.createdAt ?? '');
      if (Number.isNaN(createdAt.getTime()) || !parsed.id?.match(/^[0-9a-f-]{36}$/i)) throw new Error();
      return { createdAt, id: parsed.id };
    } catch { throw invalidNotificationCursor(); }
  }
}
