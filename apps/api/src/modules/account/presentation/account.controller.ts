import { Body, Controller, Get, Headers, Inject, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../security/current-user.decorator';
import { Public } from '../../../security/public.decorator';
import { AccountJobsService } from '../application/account-jobs.service';
import { accountJobConflict } from '../domain/account.errors';
import { RecoveryDto } from './account.dto';

@ApiTags('account')
@Controller('account')
export class AccountController {
  constructor(@Inject(AccountJobsService) private readonly jobs: AccountJobsService) {}

  @Post('exports') requestExport(
    @CurrentUser() user: { id: string },
    @Headers('idempotency-key') key?: string,
  ) {
    return this.jobs.requestExport(user.id, this.key(key));
  }
  @Get('exports/:jobId') getExport(
    @CurrentUser() user: { id: string },
    @Param('jobId') jobId: string,
  ) {
    return this.jobs.getExport(user.id, jobId);
  }
  @Post('exports/:jobId/retry') retryExport(
    @CurrentUser() user: { id: string },
    @Param('jobId') jobId: string,
  ) {
    return this.jobs.retryExport(user.id, jobId);
  }

  @Post('deletion') requestDeletion(
    @CurrentUser() user: { id: string },
    @Headers('idempotency-key') key?: string,
  ) {
    return this.jobs.requestDeletion(user.id, this.key(key));
  }
  @Get('deletion/:jobId') getDeletion(
    @CurrentUser() user: { id: string },
    @Param('jobId') jobId: string,
  ) {
    return this.jobs.getDeletion(user.id, jobId);
  }
  @Post('deletion/:jobId/cancel') cancelDeletion(
    @CurrentUser() user: { id: string },
    @Param('jobId') jobId: string,
  ) {
    return this.jobs.cancelDeletion(user.id, jobId);
  }
  @Post('deletion/:jobId/execute') executeDeletion(
    @CurrentUser() user: { id: string },
    @Param('jobId') jobId: string,
  ) {
    return this.jobs.executeDeletion(user.id, jobId);
  }
  @Public() @Post('deletion/:jobId/restore') restore(
    @Param('jobId') jobId: string,
    @Body() dto: RecoveryDto,
  ) {
    return this.jobs.restoreDeletion(jobId, dto.recoveryToken);
  }

  private key(value?: string) {
    if (!value || value.length < 8 || value.length > 200)
      throw accountJobConflict('必须提供 8-200 字符的 Idempotency-Key');
    return value;
  }
}
