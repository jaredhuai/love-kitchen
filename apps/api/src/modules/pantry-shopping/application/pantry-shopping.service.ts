import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';
import type { PantryDto, ShoppingDto } from '../presentation/pantry-shopping.dto';
import { pantryUnavailable, shoppingItemNotFound } from '../domain/pantry-shopping.errors';

@Injectable()
export class PantryShoppingService {
  constructor(private readonly prisma: PrismaService) {}
  pantry(kitchenId: string) { return this.prisma.pantryItem.findMany({ where: { kitchenId, status: 'AVAILABLE' }, orderBy: { expiresAt: 'asc' } }); }
  addPantry(kitchenId: string, userId: string, dto: PantryDto) { return this.prisma.pantryItem.create({ data: { kitchenId, createdBy: userId, updatedBy: userId, name: dto.name, quantity: dto.quantity, unit: dto.unit, storageLocation: dto.storageLocation ?? 'PANTRY', notes: dto.notes ?? null } }); }
  async consumePantry(kitchenId: string, id: string, userId: string, quantity: number) { const result = await this.prisma.pantryItem.updateMany({ where: { id, kitchenId, status: 'AVAILABLE', quantity: { gte: quantity } }, data: { quantity: { decrement: quantity }, updatedBy: userId } }); if (result.count !== 1) throw pantryUnavailable(); return this.prisma.pantryItem.findFirstOrThrow({ where: { id, kitchenId } }); }
  shopping(kitchenId: string) { return this.prisma.shoppingItem.findMany({ where: { kitchenId, checked: false }, orderBy: { createdAt: 'asc' } }); }
  addShopping(kitchenId: string, userId: string, dto: ShoppingDto) { return this.prisma.shoppingItem.create({ data: { kitchenId, createdBy: userId, source: 'MANUAL', name: dto.name, quantity: dto.quantity ?? null, unit: dto.unit ?? null, category: dto.category ?? null } }); }
  async checkShopping(kitchenId: string, id: string, userId: string) { const result = await this.prisma.shoppingItem.updateMany({ where: { id, kitchenId, checked: false }, data: { checked: true, checkedBy: userId, checkedAt: new Date() } }); if (result.count !== 1) throw shoppingItemNotFound(); return { checked: true }; }
}
