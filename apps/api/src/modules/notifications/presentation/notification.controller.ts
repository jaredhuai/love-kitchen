import { Controller, Get, Inject, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../security/current-user.decorator';
import { KitchenAccessGuard } from '../../../security/kitchen-access.guard';
import { NotificationService } from '../application/notification.service';
import { NotificationCursorQueryDto } from './notification.dto';

@ApiTags('notifications') @Controller('kitchens/:kitchenId/notifications') @UseGuards(KitchenAccessGuard)
export class NotificationController {
  constructor(@Inject(NotificationService) private readonly service: NotificationService) {}
  @Get() list(@Param('kitchenId') kitchenId: string, @CurrentUser() user: { id: string }) { return this.service.list(kitchenId, user.id); }
  @Patch(':notificationId/read') markRead(@Param('kitchenId') kitchenId: string, @Param('notificationId') id: string, @CurrentUser() user: { id: string }) { return this.service.markRead(kitchenId, user.id, id); }
}

@ApiTags('v2-notifications') @Controller({ path: 'kitchens/:kitchenId/notifications', version: '2' }) @UseGuards(KitchenAccessGuard)
export class NotificationV2Controller {
  constructor(@Inject(NotificationService) private readonly service: NotificationService) {}
  @Get() list(@Param('kitchenId') kitchenId: string, @CurrentUser() user: { id: string }, @Query() query: NotificationCursorQueryDto) { return this.service.listV2(kitchenId, user.id, query.limit, query.cursor); }
  @Patch(':notificationId/read') markRead(@Param('kitchenId') kitchenId: string, @Param('notificationId') id: string, @CurrentUser() user: { id: string }) { return this.service.markRead(kitchenId, user.id, id); }
}
