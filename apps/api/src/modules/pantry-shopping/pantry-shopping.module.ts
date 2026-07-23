import { Module } from '@nestjs/common';
import { KitchenAccessGuard } from '../../security/kitchen-access.guard';
import { PantryShoppingService } from './application/pantry-shopping.service';
import { PantryController, ShoppingController } from './presentation/pantry-shopping.controller';

@Module({ controllers: [PantryController, ShoppingController], providers: [KitchenAccessGuard, PantryShoppingService], exports: [PantryShoppingService] })
export class PantryShoppingModule {}
