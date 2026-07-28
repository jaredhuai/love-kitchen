import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../../common/app-exception';
import { BadRequestException, HttpStatus } from '@nestjs/common';
import { dishNotFound, dishUpdateEmpty } from '../domain/dish.errors';
import { DishRepository } from '../infrastructure/dish.repository';
import { DISH_CATEGORIES, type DishDto, type ReviewDto, type UpdateDishDto } from '../presentation/dish.dto';
import { IdempotencyService } from '../../../common/idempotency.service';

@Injectable()
export class DishesService {
  constructor(@Inject(DishRepository) private readonly repository: DishRepository, @Inject(IdempotencyService) private readonly idempotency?: IdempotencyService) {}
  async list(kitchenId: string, page = 1, pageSize = 20) { const take = Math.min(Math.max(pageSize, 1), 50); return (await this.repository.listOffset(kitchenId, (Math.max(page, 1) - 1) * take, take)).map(withRating); }
  async listV2(kitchenId: string, limit = 20, rawCursor?: string) {
    const cursor = rawCursor ? this.decodeCursor(rawCursor) : undefined;
    const rows = await this.repository.listCursor(kitchenId, Math.min(Math.max(limit, 1), 50), cursor);
    const hasNextPage = rows.length > limit; const items = rows.slice(0, limit); const last = items.at(-1);
    return { items: items.map(withRating), pageInfo: { nextCursor: hasNextPage && last ? this.encodeCursor(last.createdAt, last.id) : null, hasNextPage } };
  }
  async get(kitchenId: string, id: string) { const dish = await this.repository.get(kitchenId, id); if (!dish) throw dishNotFound(); return withRating(dish); }
  create(kitchenId: string, userId: string, dto: DishDto) { this.validateTemporary(dto); return this.repository.create(kitchenId, userId, dto); }
  createV2(kitchenId: string, userId: string, key: string | undefined, dto: DishDto) { this.validateTemporary(dto); if (!this.idempotency) throw new Error('IdempotencyService 未配置'); return this.idempotency.execute(userId, `v2:dishes:create:${kitchenId}`, key, dto, (tx) => this.repository.createInTransaction(tx, kitchenId, userId, dto)); }
  async update(kitchenId: string, id: string, dto: UpdateDishDto) {
    if (dto.category && !DISH_CATEGORIES.includes(dto.category)) throw new BadRequestException('菜品分类无效');
    const data = Object.fromEntries(['name', 'description', 'notes', 'category', 'kind', 'effectiveDate', 'cuisine', 'servings', 'coverImageUrl', 'isFavorite']
      .filter((key) => dto[key as keyof UpdateDishDto] !== undefined)
      .map((key) => [key, key === 'effectiveDate' ? new Date(dto.effectiveDate!) : dto[key as keyof UpdateDishDto]]));
    if (!Object.keys(data).length && dto.imageUploadIds === undefined) throw dishUpdateEmpty();
    const result = await this.repository.updateWithImages(kitchenId, id, data, dto.imageUploadIds);
    if (result.count !== 1) throw dishNotFound();
    return this.get(kitchenId, id);
  }
  async remove(kitchenId: string, id: string) { const result = await this.repository.remove(kitchenId, id); if (result.count !== 1) throw dishNotFound(); return { deleted: true }; }
  async review(kitchenId: string, dishId: string, userId: string, dto: ReviewDto) { await this.get(kitchenId, dishId); return this.repository.review(kitchenId, dishId, userId, dto); }
  private validateTemporary(dto: DishDto) {
    if (dto.category && !DISH_CATEGORIES.includes(dto.category)) {
      throw new BadRequestException('菜品分类无效');
    }
    if (dto.kind === 'TEMPORARY' && (!dto.effectiveDate || !dto.temporaryMealType)) {
      throw new BadRequestException('临时菜品必须选择日期和餐次');
    }
  }
  private encodeCursor(createdAt: Date, id: string) { return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString('base64url'); }
  private decodeCursor(value: string) { try { const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { createdAt?: string; id?: string }; const createdAt = new Date(parsed.createdAt ?? ''); if (Number.isNaN(createdAt.getTime()) || !parsed.id?.match(/^[0-9a-f-]{36}$/i)) throw new Error(); return { createdAt, id: parsed.id }; } catch { throw new AppException('INVALID_CURSOR', '分页游标无效', HttpStatus.BAD_REQUEST); } }
}

function withRating<T extends { reviews?: Array<{ tasteRating: number }> }>(dish: T) {
  const ratings = dish.reviews ?? [];
  const ratingCount = ratings.length;
  const ratingAverage = ratingCount
    ? Math.round((ratings.reduce((total, review) => total + review.tasteRating, 0) / ratingCount) * 10) / 10
    : null;
  return { ...dish, ratingCount, ratingAverage };
}
