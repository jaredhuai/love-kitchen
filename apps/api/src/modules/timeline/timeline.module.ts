import { Module } from '@nestjs/common';
import { IdempotencyService } from '../../common/idempotency.service';
import { KitchenAccessGuard } from '../../security/kitchen-access.guard';
import { TimelineService } from './application/timeline.service';
import { TimelineRepository } from './infrastructure/timeline.repository';
import { TimelineController, TimelineV2Controller } from './presentation/timeline.controller';

@Module({ controllers: [TimelineController, TimelineV2Controller], providers: [KitchenAccessGuard, IdempotencyService, TimelineRepository, TimelineService], exports: [TimelineService] })
export class TimelineModule {}
