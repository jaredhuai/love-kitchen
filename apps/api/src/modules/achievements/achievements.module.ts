import { Module } from '@nestjs/common';
import { KitchenAccessGuard } from '../../security/kitchen-access.guard';
import { AchievementsService } from './application/achievements.service';
import { AchievementsController } from './presentation/achievements.controller';

@Module({ controllers: [AchievementsController], providers: [KitchenAccessGuard, AchievementsService], exports: [AchievementsService] })
export class AchievementsModule {}
