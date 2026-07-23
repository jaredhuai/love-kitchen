import { Body, Controller, Get, Headers, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../security/current-user.decorator';
import { KitchenAccessGuard } from '../../../security/kitchen-access.guard';
import { MealHistoryService } from '../application/meal-history.service';
import { MealHistoryCursorQueryDto, MealLogDto } from './meal-history.dto';

@ApiTags('meal-history') @Controller('kitchens/:kitchenId/meal-history') @UseGuards(KitchenAccessGuard)
export class MealHistoryController {
  constructor(@Inject(MealHistoryService) private readonly service: MealHistoryService) {}
  @Get() list(@Param('kitchenId') kitchenId: string) { return this.service.list(kitchenId); }
  @Post() create(@Param('kitchenId') kitchenId: string, @CurrentUser() user: { id: string }, @Body() dto: MealLogDto) { return this.service.create(kitchenId, user.id, dto); }
}

@ApiTags('v2-meal-history') @Controller({ path: 'kitchens/:kitchenId/meal-history', version: '2' }) @UseGuards(KitchenAccessGuard)
export class MealHistoryV2Controller {
  constructor(@Inject(MealHistoryService) private readonly service: MealHistoryService) {}
  @Get() list(@Param('kitchenId') kitchenId: string, @Query() query: MealHistoryCursorQueryDto) { return this.service.listV2(kitchenId, query.limit, query.cursor); }
  @Post() create(@Param('kitchenId') kitchenId: string, @CurrentUser() user: { id: string }, @Headers('idempotency-key') key: string | undefined, @Body() dto: MealLogDto) { return this.service.createV2(kitchenId, user.id, key, dto); }
}
