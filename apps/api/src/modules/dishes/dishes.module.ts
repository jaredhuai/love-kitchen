import { Module } from '@nestjs/common';
import { DishesService } from './application/dishes.service';
import { DishRepository } from './infrastructure/dish.repository';
import { DishesController, DishesV2Controller } from './presentation/dishes.controller';
import { KitchenAccessGuard } from '../../security/kitchen-access.guard';
import { IdempotencyService } from '../../common/idempotency.service';
@Module({ controllers: [DishesController, DishesV2Controller], providers: [KitchenAccessGuard, DishRepository, IdempotencyService, DishesService], exports: [DishesService] })
export class DishesModule {}
