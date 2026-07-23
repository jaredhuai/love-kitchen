import { Module } from '@nestjs/common';
import { KitchenAccessGuard } from '../../security/kitchen-access.guard';
import { KitchenResourcePolicy } from '../../security/kitchen-resource.policy';
import { MealPlansService } from './application/meal-plans.service';
import { CookingAssignmentController, MealPlansController } from './presentation/meal-plans.controller';

@Module({ controllers: [MealPlansController, CookingAssignmentController], providers: [KitchenAccessGuard, KitchenResourcePolicy, MealPlansService], exports: [MealPlansService] })
export class MealPlansModule {}
