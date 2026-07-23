import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../security/current-user.decorator';
import { KitchenAccessGuard } from '../../../security/kitchen-access.guard';
import { PantryShoppingService } from '../application/pantry-shopping.service';
import { ConsumeDto, PantryDto, ShoppingDto } from './pantry-shopping.dto';

@ApiTags('pantry') @Controller('kitchens/:kitchenId/pantry') @UseGuards(KitchenAccessGuard)
export class PantryController { constructor(private readonly service: PantryShoppingService) {} @Get() list(@Param('kitchenId') k: string) { return this.service.pantry(k); } @Post() add(@Param('kitchenId') k: string, @CurrentUser() u: { id: string }, @Body() d: PantryDto) { return this.service.addPantry(k, u.id, d); } @Patch(':itemId/consume') consume(@Param('kitchenId') k: string, @Param('itemId') i: string, @CurrentUser() u: { id: string }, @Body() d: ConsumeDto) { return this.service.consumePantry(k, i, u.id, d.quantity); } }
@ApiTags('shopping') @Controller('kitchens/:kitchenId/shopping') @UseGuards(KitchenAccessGuard)
export class ShoppingController { constructor(private readonly service: PantryShoppingService) {} @Get() list(@Param('kitchenId') k: string) { return this.service.shopping(k); } @Post() add(@Param('kitchenId') k: string, @CurrentUser() u: { id: string }, @Body() d: ShoppingDto) { return this.service.addShopping(k, u.id, d); } @Patch(':itemId/check') check(@Param('kitchenId') k: string, @Param('itemId') i: string, @CurrentUser() u: { id: string }) { return this.service.checkShopping(k, i, u.id); } }
