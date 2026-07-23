import { Body, Controller, Get, Headers, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../security/current-user.decorator';
import { KitchenAccessGuard } from '../../../security/kitchen-access.guard';
import { TimelineService } from '../application/timeline.service';
import { TimelineCursorQueryDto, TimelineDto } from './timeline.dto';

@ApiTags('v1-timeline-deprecated') @Controller('kitchens/:kitchenId/timeline') @UseGuards(KitchenAccessGuard)
export class TimelineController {
  constructor(@Inject(TimelineService) private readonly service: TimelineService) {}
  @Get() list(@Param('kitchenId') kitchenId: string) { return this.service.list(kitchenId); }
  @Post() create(@Param('kitchenId') kitchenId: string, @CurrentUser() user: { id: string }, @Body() dto: TimelineDto) { return this.service.create(kitchenId, user.id, dto); }
}

@ApiTags('v2-timeline') @Controller({ path: 'kitchens/:kitchenId/timeline', version: '2' }) @UseGuards(KitchenAccessGuard)
export class TimelineV2Controller {
  constructor(@Inject(TimelineService) private readonly service: TimelineService) {}
  @Get() list(@Param('kitchenId') kitchenId: string, @Query() query: TimelineCursorQueryDto) { return this.service.listV2(kitchenId, query.limit, query.cursor); }
  @Post() create(@Param('kitchenId') kitchenId: string, @CurrentUser() user: { id: string }, @Headers('idempotency-key') key: string | undefined, @Body() dto: TimelineDto) { return this.service.createV2(kitchenId, user.id, key, dto); }
}
