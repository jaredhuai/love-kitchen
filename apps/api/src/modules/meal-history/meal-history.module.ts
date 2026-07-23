import { Module } from '@nestjs/common';
import { IdempotencyService } from '../../common/idempotency.service';
import { KitchenAccessGuard } from '../../security/kitchen-access.guard';
import { KitchenResourcePolicy } from '../../security/kitchen-resource.policy';
import { MealHistoryService } from './application/meal-history.service';
import { MealHistoryRepository } from './infrastructure/meal-history.repository';
import { MealHistoryController, MealHistoryV2Controller } from './presentation/meal-history.controller';

@Module({ controllers: [MealHistoryController, MealHistoryV2Controller], providers: [KitchenAccessGuard, KitchenResourcePolicy, IdempotencyService, MealHistoryRepository, MealHistoryService], exports: [MealHistoryService] })
export class MealHistoryModule {}
