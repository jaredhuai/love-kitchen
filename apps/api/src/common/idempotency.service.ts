import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../infra/prisma.service';
import { AppException } from './app-exception';
import { HttpStatus } from '@nestjs/common';

@Injectable()
export class IdempotencyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async execute<T>(userId: string, operation: string, key: string | undefined, body: unknown, work: (tx: Prisma.TransactionClient) => Promise<T>, attempt = 0): Promise<T> {
    if (!key || key.length < 8 || key.length > 200) throw new AppException('IDEMPOTENCY_KEY_REQUIRED', '需要有效的 Idempotency-Key', HttpStatus.BAD_REQUEST);
    const requestHash = createHash('sha256').update(this.stable(body)).digest('hex');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.idempotencyKey.findUnique({ where: { userId_operation_key: { userId, operation, key } } });
        if (existing) {
          if (existing.requestHash !== requestHash) throw new AppException('IDEMPOTENCY_CONFLICT', '相同幂等键对应不同请求', HttpStatus.CONFLICT);
          if (existing.response === null) throw new ConflictException('请求正在处理中');
          return existing.response as T;
        }
        const record = await tx.idempotencyKey.create({ data: { userId, operation, key, requestHash, expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } });
        const result = await work(tx);
        const response = JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue;
        await tx.idempotencyKey.update({ where: { id: record.id }, data: { response, statusCode: 201 } });
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code) && attempt < 3) return this.execute(userId, operation, key, body, work, attempt + 1);
      throw error;
    }
  }
  private stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map((item) => this.stable(item)).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${this.stable(item)}`).join(',')}}`; return JSON.stringify(value) ?? 'undefined'; }
}
