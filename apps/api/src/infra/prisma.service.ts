import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
  transaction<T>(work: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>) { return this.$transaction(work); }
}
