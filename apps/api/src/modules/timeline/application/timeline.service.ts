import { Inject, Injectable } from '@nestjs/common';
import { IdempotencyService } from '../../../common/idempotency.service';
import { invalidTimelineCursor } from '../domain/timeline.errors';
import { TimelineRepository } from '../infrastructure/timeline.repository';
import type { TimelineDto } from '../presentation/timeline.dto';

@Injectable()
export class TimelineService {
  constructor(@Inject(TimelineRepository) private readonly repository: TimelineRepository, @Inject(IdempotencyService) private readonly idempotency: IdempotencyService) {}

  list(kitchenId: string) { return this.repository.listLegacy(kitchenId); }

  async listV2(kitchenId: string, limit = 20, rawCursor?: string) {
    const pageSize = Math.min(Math.max(Number(limit), 1), 50);
    const cursor = rawCursor ? this.decodeCursor(rawCursor) : undefined;
    const rows = await this.repository.listCursor(kitchenId, pageSize, cursor);
    const hasNextPage = rows.length > pageSize;
    const items = rows.slice(0, pageSize);
    const last = items.at(-1);
    return { items, pageInfo: { nextCursor: hasNextPage && last ? this.encodeCursor(last.eventDate, last.id) : null, hasNextPage } };
  }

  create(kitchenId: string, userId: string, dto: TimelineDto) { return this.repository.create(kitchenId, userId, dto); }

  createV2(kitchenId: string, userId: string, key: string | undefined, dto: TimelineDto) {
    return this.idempotency.execute(userId, `v2:timeline:create:${kitchenId}`, key, dto, (tx) => this.repository.createInTransaction(tx, kitchenId, userId, dto));
  }

  private encodeCursor(eventDate: Date, id: string) { return Buffer.from(JSON.stringify({ eventDate: eventDate.toISOString(), id })).toString('base64url'); }
  private decodeCursor(value: string) {
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { eventDate?: string; id?: string };
      const eventDate = new Date(parsed.eventDate ?? '');
      if (Number.isNaN(eventDate.getTime()) || !parsed.id?.match(/^[0-9a-f-]{36}$/i)) throw new Error();
      return { eventDate, id: parsed.id };
    } catch { throw invalidTimelineCursor(); }
  }
}
