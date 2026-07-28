import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccountDeletionJobStatus,
  DataExportJobStatus,
  Prisma,
  UserStatus,
  type AccountDeletionJob,
} from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../../infra/prisma.service';
import {
  accountCoolingOff,
  accountJobConflict,
  accountJobNotFound,
  invalidRecoveryToken,
} from '../domain/account.errors';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const safeError = (error: unknown) =>
  (error instanceof Error ? error.name : 'UnknownError').slice(0, 100);

@Injectable()
export class AccountJobsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async requestExport(userId: string, requestKey: string) {
    const job = await this.prisma.dataExportJob.upsert({
      where: { userId_requestKey: { userId, requestKey } },
      update: {},
      create: { userId, requestKey, expiresAt: new Date(Date.now() + 7 * 864e5) },
    });
    if (job.status === DataExportJobStatus.COMPLETED) return job;
    return this.processExport(job.id, userId);
  }

  async getExport(userId: string, jobId: string) {
    const job = await this.prisma.dataExportJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw accountJobNotFound();
    if (job.expiresAt <= new Date() && job.status !== DataExportJobStatus.EXPIRED) {
      return this.prisma.dataExportJob.update({
        where: { id: job.id },
        data: { status: DataExportJobStatus.EXPIRED, result: Prisma.JsonNull },
      });
    }
    return job;
  }

  async retryExport(userId: string, jobId: string) {
    const job = await this.getExport(userId, jobId);
    if (job.status !== DataExportJobStatus.FAILED)
      throw accountJobConflict('只有失败的导出任务可以重试');
    return this.processExport(job.id, userId);
  }

  async requestDeletion(
    userId: string,
    requestKey: string,
    attempt = 0,
  ): Promise<{ job: AccountDeletionJob; recoveryToken?: string }> {
    const recoveryToken = randomBytes(32).toString('base64url');
    const coolingDays = Number(this.config.get('ACCOUNT_DELETION_COOLING_DAYS') ?? 7);
    const scheduledFor = new Date(Date.now() + coolingDays * 864e5);
    const dryRun = await this.deletionDryRun(userId);
    try {
      const job = await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.accountDeletionJob.findUnique({
            where: { userId_requestKey: { userId, requestKey } },
          });
          if (existing) {
            if (
              existing.status !== AccountDeletionJobStatus.COOLING_OFF &&
              existing.status !== AccountDeletionJobStatus.FAILED
            )
              return existing;
            return tx.accountDeletionJob.update({
              where: { id: existing.id },
              data: {
                recoveryTokenHash: hash(recoveryToken),
                dryRun,
                scheduledFor,
                status: AccountDeletionJobStatus.COOLING_OFF,
                lastError: null,
              },
            });
          }
          await tx.user.update({
            where: { id: userId },
            data: { status: UserStatus.DELETION_PENDING },
          });
          await tx.refreshTokenSession.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date(), revokeReason: 'ACCOUNT_DELETION_REQUESTED' },
          });
          await tx.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          return tx.accountDeletionJob.create({
            data: {
              userId,
              requestKey,
              scheduledFor,
              recoveryTokenHash: hash(recoveryToken),
              dryRun,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return {
        job,
        ...(job.status === AccountDeletionJobStatus.COOLING_OFF ? { recoveryToken } : {}),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code) &&
        attempt < 3
      )
        return this.requestDeletion(userId, requestKey, attempt + 1);
      throw error;
    }
  }

  async getDeletion(userId: string, jobId: string) {
    const job = await this.prisma.accountDeletionJob.findFirst({
      where: { id: jobId, userId },
      select: {
        id: true,
        status: true,
        scheduledFor: true,
        dryRun: true,
        attempts: true,
        lastError: true,
        createdAt: true,
        cancelledAt: true,
        completedAt: true,
        restoredAt: true,
      },
    });
    if (!job) throw accountJobNotFound();
    return job;
  }

  async cancelDeletion(userId: string, jobId: string) {
    return this.prisma.$transaction(async (tx) => {
      const job = await tx.accountDeletionJob.findFirst({ where: { id: jobId, userId } });
      if (!job) throw accountJobNotFound();
      if (job.status !== AccountDeletionJobStatus.COOLING_OFF)
        throw accountJobConflict('当前注销任务不能取消');
      await tx.user.update({ where: { id: userId }, data: { status: UserStatus.ACTIVE } });
      return tx.accountDeletionJob.update({
        where: { id: job.id },
        data: { status: AccountDeletionJobStatus.CANCELLED, cancelledAt: new Date() },
        select: { id: true, status: true, cancelledAt: true },
      });
    });
  }

  async executeDeletion(
    userId: string,
    jobId: string,
    now = new Date(),
    retry = 0,
  ): Promise<Awaited<ReturnType<AccountJobsService['getDeletion']>>> {
    const job = await this.prisma.accountDeletionJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw accountJobNotFound();
    if (job.status === AccountDeletionJobStatus.COMPLETED) return this.getDeletion(userId, jobId);
    if (
      job.status !== AccountDeletionJobStatus.COOLING_OFF &&
      job.status !== AccountDeletionJobStatus.FAILED
    )
      throw accountJobConflict('当前注销任务不能执行');
    if (job.scheduledFor > now) throw accountCoolingOff();
    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.accountDeletionJob.update({
            where: { id: job.id },
            data: {
              status: AccountDeletionJobStatus.PROCESSING,
              attempts: { increment: 1 },
              lastError: null,
            },
          });
          await tx.kitchenMember.updateMany({
            where: { userId, status: 'ACTIVE' },
            data: { status: 'LEFT' },
          });
          await tx.refreshTokenSession.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: now, revokeReason: 'ACCOUNT_DEACTIVATED' },
          });
          await tx.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: now },
          });
          await tx.user.update({
            where: { id: userId },
            data: { status: UserStatus.DEACTIVATED, deactivatedAt: now },
          });
          await tx.accountDeletionJob.update({
            where: { id: job.id },
            data: { status: AccountDeletionJobStatus.COMPLETED, completedAt: now },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return this.getDeletion(userId, jobId);
    } catch (error) {
      await this.prisma.accountDeletionJob.update({
        where: { id: job.id },
        data: { status: AccountDeletionJobStatus.FAILED, lastError: safeError(error) },
      });
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034' &&
        retry < 3
      )
        return this.executeDeletion(userId, jobId, now, retry + 1);
      throw error;
    }
  }

  async restoreDeletion(jobId: string, recoveryToken: string) {
    const job = await this.prisma.accountDeletionJob.findUnique({ where: { id: jobId } });
    if (!job) throw accountJobNotFound();
    const actual = Buffer.from(hash(recoveryToken), 'hex');
    const expected = Buffer.from(job.recoveryTokenHash, 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw invalidRecoveryToken();
    if (job.status !== AccountDeletionJobStatus.COMPLETED)
      throw accountJobConflict('只有已逻辑注销的账号可以恢复');
    const membershipIds = this.membershipIds(job.dryRun);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.user.update({
          where: { id: job.userId },
          data: { status: UserStatus.ACTIVE, deactivatedAt: null },
        });
        if (membershipIds.length)
          await tx.kitchenMember.updateMany({
            where: {
              id: { in: membershipIds },
              userId: job.userId,
              status: 'LEFT',
              kitchen: { deletedAt: null },
            },
            data: { status: 'ACTIVE' },
          });
        return tx.accountDeletionJob.update({
          where: { id: job.id },
          data: { status: AccountDeletionJobStatus.RESTORED, restoredAt: new Date() },
          select: { id: true, status: true, restoredAt: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async processExport(jobId: string, userId: string) {
    await this.prisma.dataExportJob.update({
      where: { id: jobId },
      data: {
        status: DataExportJobStatus.PROCESSING,
        startedAt: new Date(),
        attempts: { increment: 1 },
        lastError: null,
      },
    });
    try {
      const result = await this.buildExport(userId);
      return await this.prisma.dataExportJob.update({
        where: { id: jobId },
        data: { status: DataExportJobStatus.COMPLETED, result, completedAt: new Date() },
      });
    } catch (error) {
      await this.prisma.dataExportJob.update({
        where: { id: jobId },
        data: { status: DataExportJobStatus.FAILED, lastError: safeError(error) },
      });
      throw error;
    }
  }

  private async buildExport(userId: string): Promise<Prisma.InputJsonValue> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, nickname: true, avatarUrl: true, createdAt: true, profile: true },
    });
    if (!user) throw accountJobNotFound();
    const memberships = await this.prisma.kitchenMember.findMany({
      where: { userId, status: 'ACTIVE', kitchen: { deletedAt: null } },
      select: {
        id: true,
        role: true,
        joinedAt: true,
        kitchen: { select: { id: true, name: true, slogan: true, createdAt: true } },
      },
    });
    const kitchenIds = memberships.map(({ kitchen }) => kitchen.id);
    const [dishes, mealLogs, preferences, conversations, letters, uploads] = await Promise.all([
      this.prisma.dish.findMany({
        where: { kitchenId: { in: kitchenIds }, deletedAt: null },
        select: {
          id: true,
          kitchenId: true,
          name: true,
          description: true,
          category: true,
          cuisine: true,
          createdAt: true,
        },
      }),
      this.prisma.mealLog.findMany({
        where: { kitchenId: { in: kitchenIds } },
        select: {
          id: true,
          kitchenId: true,
          dishId: true,
          eatenAt: true,
          mealType: true,
          notes: true,
        },
      }),
      this.prisma.mealPreferenceSubmission.findMany({
        where: { userId, kitchenId: { in: kitchenIds } },
        select: {
          id: true,
          kitchenId: true,
          sessionId: true,
          preferencePayload: true,
          submittedAt: true,
          revealedAt: true,
        },
      }),
      this.prisma.aIConversation.findMany({
        where: { userId, kitchenId: { in: kitchenIds } },
        select: {
          id: true,
          kitchenId: true,
          title: true,
          purpose: true,
          createdAt: true,
          messages: { select: { role: true, content: true, createdAt: true } },
        },
      }),
      this.prisma.loveLetter.findMany({
        where: {
          kitchenId: { in: kitchenIds },
          deletedAt: null,
          OR: [{ createdBy: userId }, { recipientUserId: userId }],
        },
        select: {
          id: true,
          kitchenId: true,
          createdBy: true,
          recipientUserId: true,
          title: true,
          status: true,
          unlockType: true,
          unlockAt: true,
          createdAt: true,
          openedAt: true,
        },
      }),
      this.prisma.uploadFile.findMany({
        where: { createdBy: userId, kitchenId: { in: kitchenIds }, deletedAt: null },
        select: {
          id: true,
          kitchenId: true,
          mimeType: true,
          sizeBytes: true,
          originalName: true,
          checksum: true,
          createdAt: true,
        },
      }),
    ]);
    return JSON.parse(
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        user,
        memberships,
        dishes,
        mealLogs,
        preferences,
        conversations,
        letters,
        uploads,
      }),
    ) as Prisma.InputJsonValue;
  }

  private async deletionDryRun(userId: string): Promise<Prisma.InputJsonValue> {
    const memberships = await this.prisma.kitchenMember.findMany({
      where: { userId, status: 'ACTIVE', kitchen: { deletedAt: null } },
      select: { id: true, kitchenId: true, role: true },
    });
    return {
      permanentPurgeEnabled: false,
      activeMembershipIds: memberships.map(({ id }) => id),
      affectedKitchenIds: memberships.map(({ kitchenId }) => kitchenId),
      ownedKitchenCount: memberships.filter(({ role }) => role === 'OWNER').length,
    };
  }

  private membershipIds(value: Prisma.JsonValue) {
    if (!value || Array.isArray(value) || typeof value !== 'object') return [];
    const ids = (value as Prisma.JsonObject).activeMembershipIds;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  }
}
