import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiUsageStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import {
  AI_PROVIDER,
  AiProviderException,
  type AiProvider,
  type AiRequest,
} from '../../../infra/ai/ai-provider';
import { PrismaService } from '../../../infra/prisma.service';
import { RedisService } from '../../../infra/redis.service';
import { aiConcurrencyLimited, aiDisabled, aiQuotaExceeded } from '../domain/ai.errors';

type ExecuteInput<T> = {
  kitchenId: string;
  userId: string;
  requestKey: string;
  request: AiRequest;
  schema: z.ZodType<T>;
  fallback: () => T;
  persist: (result: T, degraded: boolean) => Promise<unknown>;
};

@Injectable()
export class AiOrchestratorService {
  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async execute<T>(input: ExecuteInput<T>): Promise<T> {
    if (this.config.get('AI_ENABLED') === false) throw aiDisabled();
    const existing = await this.prisma.aiUsageRecord.findUnique({
      where: {
        userId_kitchenId_requestKey: {
          userId: input.userId,
          kitchenId: input.kitchenId,
          requestKey: input.requestKey,
        },
      },
    });
    if (existing?.status === AiUsageStatus.SUCCEEDED || existing?.status === AiUsageStatus.DEGRADED)
      return existing.response as T;
    if (existing?.status === AiUsageStatus.IN_PROGRESS) throw aiConcurrencyLimited();

    const lockToken = randomUUID();
    const lockKey = `ai:lock:${input.userId}:${input.kitchenId}`;
    const lockSeconds =
      Math.ceil(Number(this.config.get('AI_ORCHESTRATOR_TIMEOUT_MS') ?? 20_000) / 1_000) + 5;
    if ((await this.redis.client.set(lockKey, lockToken, 'EX', lockSeconds, 'NX')) !== 'OK')
      throw aiConcurrencyLimited();
    let quotaReserved = false;
    const started = Date.now();
    try {
      await this.reserveQuota(input.userId, input.kitchenId);
      quotaReserved = true;
      const usage = existing
        ? await this.prisma.aiUsageRecord.update({
            where: { id: existing.id },
            data: { status: AiUsageStatus.IN_PROGRESS, errorCode: null, response: Prisma.JsonNull },
          })
        : await this.createUsage(input);
      try {
        const result = await this.withTimeout(
          this.provider.completeJson(input.request, input.schema),
        );
        await input.persist(result, false);
        await this.completeUsage(usage.id, result, input.request, started, AiUsageStatus.SUCCEEDED);
        return result;
      } catch (error) {
        if (this.canFallback(error)) {
          const fallback = input.fallback();
          await input.persist(fallback, true);
          await this.completeUsage(
            usage.id,
            fallback,
            input.request,
            started,
            AiUsageStatus.DEGRADED,
          );
          await this.releaseQuota(input.userId, input.kitchenId);
          quotaReserved = false;
          return fallback;
        }
        await this.prisma.aiUsageRecord.update({
          where: { id: usage.id },
          data: {
            status: AiUsageStatus.FAILED,
            latencyMs: Date.now() - started,
            errorCode: this.errorCode(error),
            completedAt: new Date(),
          },
        });
        throw error;
      }
    } catch (error) {
      if (quotaReserved) await this.releaseQuota(input.userId, input.kitchenId);
      throw error;
    } finally {
      await this.redis.client.eval(
        "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
        1,
        lockKey,
        lockToken,
      );
    }
  }

  async metrics(kitchenId: string, userId: string, since = new Date(Date.now() - 30 * 864e5)) {
    const [totals, statuses] = await Promise.all([
      this.prisma.aiUsageRecord.aggregate({
        where: { kitchenId, userId, createdAt: { gte: since } },
        _sum: {
          estimatedInputTokens: true,
          estimatedOutputTokens: true,
          costMicros: true,
          latencyMs: true,
        },
        _avg: { latencyMs: true },
        _count: true,
      }),
      this.prisma.aiUsageRecord.groupBy({
        by: ['status'],
        where: { kitchenId, userId, createdAt: { gte: since } },
        _count: true,
      }),
    ]);
    return {
      since: since.toISOString(),
      requests: totals._count,
      inputTokens: totals._sum.estimatedInputTokens ?? 0,
      outputTokens: totals._sum.estimatedOutputTokens ?? 0,
      costMicros: totals._sum.costMicros ?? 0,
      averageLatencyMs: Math.round(totals._avg.latencyMs ?? 0),
      statuses: Object.fromEntries(statuses.map(({ status, _count }) => [status, _count])),
    };
  }

  private async createUsage<T>(input: ExecuteInput<T>) {
    try {
      return await this.prisma.aiUsageRecord.create({
        data: {
          kitchenId: input.kitchenId,
          userId: input.userId,
          requestKey: input.requestKey,
          provider: 'qwen',
          model: this.config.get('QWEN_MODEL') ?? 'qwen3.7-plus',
          expiresAt: new Date(
            Date.now() + Number(this.config.get('AI_REQUEST_RETENTION_DAYS') ?? 30) * 864e5,
          ),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw aiConcurrencyLimited();
      throw error;
    }
  }

  private async reserveQuota(userId: string, kitchenId: string) {
    const day = new Date().toISOString().slice(0, 10);
    const result = await this.redis.client.eval(
      "local u=tonumber(redis.call('get',KEYS[1]) or '0'); local k=tonumber(redis.call('get',KEYS[2]) or '0'); if u>=tonumber(ARGV[1]) or k>=tonumber(ARGV[2]) then return 0 end; redis.call('incr',KEYS[1]); redis.call('expire',KEYS[1],ARGV[3]); redis.call('incr',KEYS[2]); redis.call('expire',KEYS[2],ARGV[3]); return 1",
      2,
      `ai:quota:user:${userId}:${day}`,
      `ai:quota:kitchen:${kitchenId}:${day}`,
      Number(this.config.get('AI_USER_DAILY_LIMIT') ?? 20),
      Number(this.config.get('AI_KITCHEN_DAILY_LIMIT') ?? 30),
      172800,
    );
    if (Number(result) !== 1) throw aiQuotaExceeded();
  }

  private async releaseQuota(userId: string, kitchenId: string) {
    const day = new Date().toISOString().slice(0, 10);
    await this.redis.client.eval(
      "for i=1,2 do local v=tonumber(redis.call('get',KEYS[i]) or '0'); if v>0 then redis.call('decr',KEYS[i]) end end; return 1",
      2,
      `ai:quota:user:${userId}:${day}`,
      `ai:quota:kitchen:${kitchenId}:${day}`,
    );
  }

  private async completeUsage<T>(
    id: string,
    result: T,
    request: AiRequest,
    started: number,
    status: AiUsageStatus,
  ) {
    const inputChars = request.messages.reduce((sum, message) => sum + message.content.length, 0);
    const outputChars = JSON.stringify(result).length;
    const estimatedInputTokens = Math.ceil(inputChars / 4);
    const estimatedOutputTokens = Math.ceil(outputChars / 4);
    const costMicros = Math.ceil(
      (estimatedInputTokens *
        Number(this.config.get('AI_INPUT_COST_MICROS_PER_MILLION') ?? 1_000_000) +
        estimatedOutputTokens *
          Number(this.config.get('AI_OUTPUT_COST_MICROS_PER_MILLION') ?? 2_000_000)) /
        1_000_000,
    );
    await this.prisma.aiUsageRecord.update({
      where: { id },
      data: {
        status,
        response: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
        estimatedInputTokens,
        estimatedOutputTokens,
        costMicros: status === AiUsageStatus.SUCCEEDED ? costMicros : 0,
        latencyMs: Date.now() - started,
        completedAt: new Date(),
      },
    });
  }

  private withTimeout<T>(promise: Promise<T>) {
    const timeoutMs = Number(this.config.get('AI_ORCHESTRATOR_TIMEOUT_MS') ?? 20_000);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new AiProviderException('AI_TIMEOUT', 'AI 服务响应超时', 504)),
        timeoutMs,
      );
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private canFallback(error: unknown) {
    if (this.config.get('AI_FALLBACK_ENABLED') === false) return false;
    return [
      'AI_TIMEOUT',
      'AI_RATE_LIMITED',
      'AI_UPSTREAM_UNAVAILABLE',
      'AI_NOT_CONFIGURED',
    ].includes(this.errorCode(error));
  }

  private errorCode(error: unknown) {
    const response =
      error && typeof error === 'object' && 'getResponse' in error
        ? (error as { getResponse(): unknown }).getResponse()
        : null;
    return response && typeof response === 'object' && 'code' in response
      ? String((response as { code: unknown }).code).slice(0, 80)
      : error instanceof Error
        ? error.name.slice(0, 80)
        : 'UNKNOWN';
  }
}
