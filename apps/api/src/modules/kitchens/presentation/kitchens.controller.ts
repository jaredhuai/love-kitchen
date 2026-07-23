import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../security/current-user.decorator';
import { KitchenAccessGuard } from '../../../security/kitchen-access.guard';
import { KitchenOwnerGuard } from '../../../security/kitchen-owner.guard';
import { Public } from '../../../security/public.decorator';
import { KitchensService } from '../application/kitchens.service';
import { CreateKitchenDto } from './kitchens.dto';

@ApiTags('kitchens') @Controller()
export class KitchensController {
  constructor(private readonly service: KitchensService) {}
  @Post('kitchens') create(@CurrentUser() user: { id: string }, @Body() dto: CreateKitchenDto) { return this.service.create(user.id, dto); }
  @UseGuards(KitchenAccessGuard, KitchenOwnerGuard) @Post('kitchens/:kitchenId/invites') invite(@Param('kitchenId') kitchenId: string, @CurrentUser() user: { id: string }) { return this.service.invite(kitchenId, user.id); }
  @Public() @Get('invites/:token/preview') preview(@Param('token') token: string) { return this.service.preview(token); }
  @Post('invites/:token/accept') accept(@Param('token') token: string, @CurrentUser() user: { id: string }) { return this.service.accept(token, user.id); }
}
