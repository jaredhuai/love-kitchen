import { Module } from '@nestjs/common';
import { AccountJobsService } from './application/account-jobs.service';
import { AccountController } from './presentation/account.controller';

@Module({
  controllers: [AccountController],
  providers: [AccountJobsService],
  exports: [AccountJobsService],
})
export class AccountModule {}
