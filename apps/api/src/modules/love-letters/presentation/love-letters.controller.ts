import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../security/current-user.decorator';
import { KitchenAccessGuard } from '../../../security/kitchen-access.guard';
import { LoveLettersService } from '../application/love-letters.service';
import { CreateLetterDto } from './love-letter.dto';

@ApiTags('love-letters') @Controller('kitchens/:kitchenId/love-letters') @UseGuards(KitchenAccessGuard)
export class LoveLettersController {
  constructor(@Inject(LoveLettersService) private readonly service: LoveLettersService) {}
  @Get() list(@Param('kitchenId') kitchenId: string, @CurrentUser() user: { id: string }) { return this.service.list(kitchenId, user.id); }
  @Post() create(@Param('kitchenId') kitchenId: string, @CurrentUser() user: { id: string }, @Body() dto: CreateLetterDto) { return this.service.create(kitchenId, user.id, dto); }
  @Post(':letterId/unlock') unlock(@Param('kitchenId') kitchenId: string, @Param('letterId') id: string, @CurrentUser() user: { id: string }) { return this.service.unlockManual(kitchenId, id, user.id); }
  @Get(':letterId/open') open(@Param('kitchenId') kitchenId: string, @Param('letterId') id: string, @CurrentUser() user: { id: string }) { return this.service.open(kitchenId, id, user.id); }
}
