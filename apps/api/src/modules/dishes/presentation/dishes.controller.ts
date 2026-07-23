import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../security/current-user.decorator';
import { KitchenAccessGuard } from '../../../security/kitchen-access.guard';
import { DishesService } from '../application/dishes.service';
import { DishCursorQueryDto, DishDto, DishPageQueryDto, ReviewDto, UpdateDishDto } from './dish.dto';

@ApiTags('v1-dishes-deprecated') @Controller('kitchens/:kitchenId/dishes') @UseGuards(KitchenAccessGuard)
export class DishesController {
  constructor(@Inject(DishesService) private readonly service: DishesService) {}
  @Get() list(@Param('kitchenId') id: string, @Query() query: DishPageQueryDto) { return this.service.list(id, query.page, query.pageSize); }
  @Get(':dishId') get(@Param('kitchenId') kitchenId: string, @Param('dishId') id: string) { return this.service.get(kitchenId, id); }
  @Post() create(@Param('kitchenId') kitchenId: string, @CurrentUser() user: { id: string }, @Body() dto: DishDto) { return this.service.create(kitchenId, user.id, dto); }
  @Patch(':dishId') update(@Param('kitchenId') kitchenId: string, @Param('dishId') id: string, @Body() dto: UpdateDishDto) { return this.service.update(kitchenId, id, dto); }
  @Delete(':dishId') remove(@Param('kitchenId') kitchenId: string, @Param('dishId') id: string) { return this.service.remove(kitchenId, id); }
  @Post(':dishId/reviews') review(@Param('kitchenId') kitchenId: string, @Param('dishId') id: string, @CurrentUser() user: { id: string }, @Body() dto: ReviewDto) { return this.service.review(kitchenId, id, user.id, dto); }
}

@ApiTags('v2-dishes') @Controller({ path: 'kitchens/:kitchenId/dishes', version: '2' }) @UseGuards(KitchenAccessGuard)
export class DishesV2Controller {
  constructor(@Inject(DishesService) private readonly service: DishesService) {}
  @Get() list(@Param('kitchenId') kitchenId: string, @Query() query: DishCursorQueryDto) { return this.service.listV2(kitchenId, query.limit, query.cursor); }
  @Get(':dishId') get(@Param('kitchenId') kitchenId: string, @Param('dishId') id: string) { return this.service.get(kitchenId, id); }
  @Post() create(@Param('kitchenId') kitchenId: string, @CurrentUser() user: { id: string }, @Headers('idempotency-key') key: string | undefined, @Body() dto: DishDto) { return this.service.createV2(kitchenId, user.id, key, dto); }
}
