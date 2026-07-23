import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  constructor(@Inject(ConfigService) config: ConfigService) { this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), { lazyConnect: true, maxRetriesPerRequest: 1 }); }
  async onModuleDestroy() { this.client.disconnect(); }
}
