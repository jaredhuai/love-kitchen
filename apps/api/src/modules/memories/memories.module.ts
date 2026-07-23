import { Module } from '@nestjs/common';
import { KitchenAccessGuard } from '../../security/kitchen-access.guard';
import { MemoriesService } from './application/memories.service';
import { AnniversariesController, StoriesController } from './presentation/memories.controller';
@Module({ controllers: [StoriesController, AnniversariesController], providers: [KitchenAccessGuard, MemoriesService], exports: [MemoriesService] }) export class MemoriesModule {}
