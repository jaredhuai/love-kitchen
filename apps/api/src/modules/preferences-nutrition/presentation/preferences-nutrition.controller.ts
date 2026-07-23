import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../security/current-user.decorator';
import { KitchenAccessGuard } from '../../../security/kitchen-access.guard';
import { PreferencesNutritionService } from '../application/preferences-nutrition.service';
import { NutritionDto, PreferenceDto, PreferenceQuery } from './preferences-nutrition.dto';

@ApiTags('preferences') @Controller('kitchens/:kitchenId/preferences') @UseGuards(KitchenAccessGuard)
export class PreferencesController {
  constructor(@Inject(PreferencesNutritionService) private readonly service: PreferencesNutritionService) {}
  @Get() get(@Param('kitchenId') kitchenId: string, @CurrentUser() user: { id: string }, @Query() query: PreferenceQuery) { return this.service.get(kitchenId, user.id, query); }
  @Post() submit(@Param('kitchenId') kitchenId: string, @CurrentUser() user: { id: string }, @Body() dto: PreferenceDto, @Query() query: PreferenceQuery) { return this.service.submit(kitchenId, user.id, query, dto); }
  @Post('reveal') reveal(@Param('kitchenId') kitchenId: string, @CurrentUser() user: { id: string }, @Query() query: PreferenceQuery) { return this.service.reveal(kitchenId, user.id, query); }
  @Post('close') close(@Param('kitchenId') kitchenId: string, @CurrentUser() user: { id: string }, @Query() query: PreferenceQuery) { return this.service.close(kitchenId, user.id, query); }
}

@ApiTags('nutrition') @Controller('kitchens/:kitchenId/nutrition') @UseGuards(KitchenAccessGuard)
export class NutritionController {
  constructor(@Inject(PreferencesNutritionService) private readonly service: PreferencesNutritionService) {}
  @Post('calculate') calculate(@Body() dto: NutritionDto) { return this.service.calculate(dto); }
}
