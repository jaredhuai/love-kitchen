import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../security/current-user.decorator';
import { KitchenAccessGuard } from '../../../security/kitchen-access.guard';
import { MemoriesService } from '../application/memories.service';
import { AnniversaryDto, StoryDto } from './memories.dto';
@ApiTags('stories') @Controller('kitchens/:kitchenId/stories') @UseGuards(KitchenAccessGuard) export class StoriesController { constructor(private readonly service: MemoriesService) {} @Get() list(@Param('kitchenId') k: string) { return this.service.stories(k); } @Post() create(@Param('kitchenId') k: string, @CurrentUser() u: { id: string }, @Body() d: StoryDto) { return this.service.createStory(k, u.id, d); } @Delete(':storyId') remove(@Param('kitchenId') k: string, @Param('storyId') i: string) { return this.service.deleteStory(k, i); } }
@ApiTags('anniversaries') @Controller('kitchens/:kitchenId/anniversaries') @UseGuards(KitchenAccessGuard) export class AnniversariesController { constructor(private readonly service: MemoriesService) {} @Get() list(@Param('kitchenId') k: string) { return this.service.anniversaries(k); } @Post() create(@Param('kitchenId') k: string, @CurrentUser() u: { id: string }, @Body() d: AnniversaryDto) { return this.service.createAnniversary(k, u.id, d); } }
