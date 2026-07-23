import { Module } from '@nestjs/common';
import { KitchenAccessGuard } from '../../security/kitchen-access.guard';
import { PreferencesNutritionService } from './application/preferences-nutrition.service';
import { NutritionController, PreferencesController } from './presentation/preferences-nutrition.controller';

@Module({ controllers: [PreferencesController, NutritionController], providers: [KitchenAccessGuard, PreferencesNutritionService], exports: [PreferencesNutritionService] })
export class PreferencesNutritionModule {}
