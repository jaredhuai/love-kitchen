import { describe, expect, it, vi } from 'vitest';
import { DishesService } from '../src/modules/dishes';
describe('DishesService', () => {
  it('创建菜品时绑定 kitchenId 和创建者', async () => { const create = vi.fn(); const service = new DishesService({ create } as never); await service.create('kitchen-a', 'user-a', { name: '番茄鸡蛋' }); expect(create).toHaveBeenCalledWith('kitchen-a', 'user-a', expect.objectContaining({ name: '番茄鸡蛋' })); });
  it('点评先按厨房读取菜品再 Upsert', async () => { const get = vi.fn().mockResolvedValue({ id: 'dish-1' }); const review = vi.fn(); const service = new DishesService({ get, review } as never); await service.review('kitchen-a', 'dish-1', 'user-a', { tasteRating: 5, appearanceRating: 4, careRating: 5 }); expect(get).toHaveBeenCalledWith('kitchen-a', 'dish-1'); expect(review).toHaveBeenCalledWith('kitchen-a', 'dish-1', 'user-a', expect.anything()); });
  it('软删除通过 Repository 绑定厨房', async () => { const remove = vi.fn().mockResolvedValue({ count: 1 }); const service = new DishesService({ remove } as never); await service.remove('kitchen-a', 'dish-1'); expect(remove).toHaveBeenCalledWith('kitchen-a', 'dish-1'); });
  it('更新只映射允许字段', async () => { const updateWithImages = vi.fn().mockResolvedValue({ count: 1 }); const get = vi.fn().mockResolvedValue({ id: 'dish-1' }); const service = new DishesService({ updateWithImages, get } as never); await service.update('kitchen-a', 'dish-1', { name: '新菜名', kitchenId: 'bad' } as never); expect(updateWithImages).toHaveBeenCalledWith('kitchen-a', 'dish-1', { name: '新菜名' }, undefined); });
  it('拒绝空更新', async () => { const updateWithImages = vi.fn(); const service = new DishesService({ updateWithImages } as never); await expect(service.update('kitchen-a', 'dish-1', {})).rejects.toThrow('至少提供一个要更新的字段'); expect(updateWithImages).not.toHaveBeenCalled(); });
  it('未评价返回空评分，有评价返回真实平均分', async () => {
    const listOffset = vi.fn().mockResolvedValue([
      { id: 'dish-1', reviews: [] },
      { id: 'dish-2', reviews: [{ tasteRating: 5 }, { tasteRating: 4 }] },
    ]);
    const result = await new DishesService({ listOffset } as never).list('kitchen-a');
    expect(result[0]).toMatchObject({ ratingAverage: null, ratingCount: 0 });
    expect(result[1]).toMatchObject({ ratingAverage: 4.5, ratingCount: 2 });
  });
  it('临时菜品必须绑定日期和餐次', async () => {
    const service = new DishesService({ create: vi.fn() } as never);
    expect(() => service.create('kitchen-a', 'user-a', { name: '火锅', kind: 'TEMPORARY' })).toThrow('临时菜品必须选择日期和餐次');
  });
  it('生成稳定 Cursor 页面并拒绝伪造 Cursor', async () => { const rows = [{ id: '10000000-0000-4000-8000-000000000001', createdAt: new Date('2026-01-02') }, { id: '10000000-0000-4000-8000-000000000002', createdAt: new Date('2026-01-01') }]; const service = new DishesService({ listCursor: vi.fn().mockResolvedValue(rows) } as never); const page = await service.listV2('k', 1); expect(page.pageInfo.hasNextPage).toBe(true); expect(page.pageInfo.nextCursor).toEqual(expect.any(String)); await expect(service.listV2('k', 1, 'bad')).rejects.toMatchObject({ response: { code: 'INVALID_CURSOR' } }); });
});
