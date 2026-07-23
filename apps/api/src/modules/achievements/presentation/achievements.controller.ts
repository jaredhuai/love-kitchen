import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { KitchenAccessGuard } from '../../../security/kitchen-access.guard';
import { AchievementsService } from '../application/achievements.service';

@ApiTags('achievements') @Controller('kitchens/:kitchenId/achievements') @UseGuards(KitchenAccessGuard)
export class AchievementsController {
  constructor(private readonly service: AchievementsService) {}
  @Get() list(@Param('kitchenId') kitchenId: string) { return this.service.list(kitchenId); }
  @Post('evaluate') evaluate(@Param('kitchenId') kitchenId: string) { return this.service.evaluate(kitchenId); }
}
