import { Module } from '@nestjs/common';
import { KitchenAccessGuard } from '../../security/kitchen-access.guard';
import { KitchenOwnerGuard } from '../../security/kitchen-owner.guard';
import { KitchensService } from './application/kitchens.service';
import { KitchensController } from './presentation/kitchens.controller';

@Module({ controllers: [KitchensController], providers: [KitchenAccessGuard, KitchenOwnerGuard, KitchensService], exports: [KitchensService] })
export class KitchensModule {}
