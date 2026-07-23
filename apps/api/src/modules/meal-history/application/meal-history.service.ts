import { Inject, Injectable } from '@nestjs/common';
import { IdempotencyService } from '../../../common/idempotency.service';
import { invalidMealHistoryCursor } from '../domain/meal-history.errors';
import { MealHistoryRepository } from '../infrastructure/meal-history.repository';
import type { MealLogDto } from '../presentation/meal-history.dto';

@Injectable()
export class MealHistoryService {
  constructor(@Inject(MealHistoryRepository) private readonly repository: MealHistoryRepository, @Inject(IdempotencyService) private readonly idempotency: IdempotencyService) {}

  list(kitchenId: string) { return this.repository.listLegacy(kitchenId); }

  async listV2(kitchenId: string, limit = 20, rawCursor?: string) {
    const pageSize = Math.min(Math.max(Number(limit), 1), 50);
    const cursor = rawCursor ? this.decodeCursor(rawCursor) : undefined;
    const rows = await this.repository.listCursor(kitchenId, pageSize, cursor);
    const hasNextPage = rows.length > pageSize;
    const items = rows.slice(0, pageSize);
    const last = items.at(-1);
    return { items, pageInfo: { nextCursor: hasNextPage && last ? this.encodeCursor(last.eatenAt, last.id) : null, hasNextPage } };
  }

  create(kitchenId: string, userId: string, dto: MealLogDto) { return this.repository.create(kitchenId, userId, dto); }

  createV2(kitchenId: string, userId: string, key: string | undefined, dto: MealLogDto) {
    return this.idempotency.execute(userId, `v2:meal-history:create:${kitchenId}`, key, dto, (tx) => this.repository.createInTransaction(tx, kitchenId, userId, dto));
  }

  private encodeCursor(eatenAt: Date, id: string) { return Buffer.from(JSON.stringify({ eatenAt: eatenAt.toISOString(), id })).toString('base64url'); }
  private decodeCursor(value: string) {
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { eatenAt?: string; id?: string };
      const eatenAt = new Date(parsed.eatenAt ?? '');
      if (Number.isNaN(eatenAt.getTime()) || !parsed.id?.match(/^[0-9a-f-]{36}$/i)) throw new Error();
      return { eatenAt, id: parsed.id };
    } catch { throw invalidMealHistoryCursor(); }
  }
}
