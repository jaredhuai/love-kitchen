import { Module } from '@nestjs/common';
import { KitchenAccessGuard } from '../../security/kitchen-access.guard';
import { NotificationService } from './application/notification.service';
import { NotificationRepository } from './infrastructure/notification.repository';
import { NotificationController, NotificationV2Controller } from './presentation/notification.controller';

@Module({ controllers: [NotificationController, NotificationV2Controller], providers: [KitchenAccessGuard, NotificationRepository, NotificationService] })
export class NotificationsModule {}
