import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { configSchema } from './config/config.schema';
import { InfraModule } from './infra/infra.module';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { HealthController } from './modules/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { KitchensModule } from './modules/kitchens/kitchens.module';
import { JwtAuthGuard } from './security/jwt-auth.guard';
import { KitchenAccessGuard } from './security/kitchen-access.guard';
import { DishesModule } from './modules/dishes/dishes.module';
import { PantryShoppingModule } from './modules/pantry-shopping/pantry-shopping.module';
import { LoveLettersModule } from './modules/love-letters/love-letters.module';
import { MemoriesModule } from './modules/memories/memories.module';
import { TimelineModule } from './modules/timeline/timeline.module';
import { PreferencesNutritionModule } from './modules/preferences-nutrition/preferences-nutrition.module';
import { MealPlansModule } from './modules/meal-plans/meal-plans.module';
import { MealHistoryModule } from './modules/meal-history/meal-history.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AiModule } from './modules/ai/ai.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { AchievementsModule } from './modules/achievements/achievements.module';
import { RateLimitMiddleware } from './common/rate-limit.middleware';
import { KitchenResourcePolicy } from './security/kitchen-resource.policy';
import { AccountModule } from './modules/account/account.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env', '../../.env'],
      validate: (value) => configSchema.parse(value),
    }),
    JwtModule.register({ global: true }),
    InfraModule,
    AuthModule,
    AccountModule,
    DishesModule,
    TimelineModule,
    MealHistoryModule,
    NotificationsModule,
    AiModule,
    MealPlansModule,
    PreferencesNutritionModule,
    UploadsModule,
    LoveLettersModule,
    PantryShoppingModule,
    MemoriesModule,
    KitchensModule,
    AchievementsModule,
  ],
  controllers: [HealthController],
  providers: [
    KitchenAccessGuard,
    KitchenResourcePolicy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, RateLimitMiddleware).forRoutes('*');
  }
}
