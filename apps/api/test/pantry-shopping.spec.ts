import { describe, expect, it, vi } from 'vitest';
import { PantryShoppingService } from '../src/modules/pantry-shopping';

describe('PantryShoppingService', () => {
  it('库存查询始终带 kitchenId 和 AVAILABLE 条件', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new PantryShoppingService({ pantryItem: { findMany } } as never);
    await service.pantry('kitchen-a');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { kitchenId: 'kitchen-a', status: 'AVAILABLE' } }));
  });
  it('购物清单勾选不能更新其他厨房项目', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const service = new PantryShoppingService({ shoppingItem: { updateMany } } as never);
    await expect(service.checkShopping('kitchen-a', 'item-b', 'user-a')).rejects.toThrow('购物项不存在');
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'item-b', kitchenId: 'kitchen-a', checked: false } }));
  });
});
