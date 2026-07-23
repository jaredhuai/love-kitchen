import { Module } from '@nestjs/common';
import { KitchenAccessGuard } from '../../security/kitchen-access.guard';
import { LoveLettersService } from './application/love-letters.service';
import { LoveLettersController } from './presentation/love-letters.controller';

@Module({ controllers: [LoveLettersController], providers: [KitchenAccessGuard, LoveLettersService], exports: [LoveLettersService] })
export class LoveLettersModule {}
