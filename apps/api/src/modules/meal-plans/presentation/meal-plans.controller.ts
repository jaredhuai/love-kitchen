import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../security/current-user.decorator';
import { KitchenAccessGuard } from '../../../security/kitchen-access.guard';
import { MealPlansService } from '../application/meal-plans.service';
import { AssignmentDto, MealDto, PlanDto, UpdateMealDto, VoteDto } from './meal-plans.dto';

@ApiTags('meal-plans') @Controller('kitchens/:kitchenId/meal-plans') @UseGuards(KitchenAccessGuard)
export class MealPlansController {
  constructor(@Inject(MealPlansService) private readonly service: MealPlansService) {}
  @Get() list(@Param('kitchenId') kitchenId: string, @Query('from') from?: string) { return this.service.list(kitchenId, from); }
  @Post('groups') group(@Param('kitchenId') kitchenId: string, @CurrentUser() user: { id: string }, @Body() dto: PlanDto) { return this.service.createGroup(kitchenId, user.id, dto); }
  @Post() add(@Param('kitchenId') kitchenId: string, @CurrentUser() user: { id: string }, @Body() dto: MealDto) { return this.service.add(kitchenId, user.id, dto); }
  @Patch(':mealPlanId') update(@Param('kitchenId') kitchenId: string, @Param('mealPlanId') id: string, @Body() dto: UpdateMealDto) { return this.service.update(kitchenId, id, dto); }
  @Delete(':mealPlanId') remove(@Param('kitchenId') kitchenId: string, @Param('mealPlanId') id: string) { return this.service.remove(kitchenId, id); }
  @Post(':mealPlanId/votes') vote(@Param('kitchenId') kitchenId: string, @Param('mealPlanId') id: string, @CurrentUser() user: { id: string }, @Body() dto: VoteDto) { return this.service.vote(kitchenId, id, user.id, dto); }
}

@ApiTags('cooking-assignment') @Controller('kitchens/:kitchenId/cooking-assignment') @UseGuards(KitchenAccessGuard)
export class CookingAssignmentController {
  constructor(@Inject(MealPlansService) private readonly service: MealPlansService) {}
  @Post() assign(@Param('kitchenId') kitchenId: string, @CurrentUser() user: { id: string }, @Body() dto: AssignmentDto) { return this.service.assignment(kitchenId, user.id, dto); }
}
