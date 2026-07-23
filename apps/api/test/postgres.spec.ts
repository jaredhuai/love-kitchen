import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('E2E infrastructure isolation', () => {
  let prisma: PrismaClient;
  let redis: Redis;

  beforeAll(async () => {
    const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
    const redisUrl = new URL(process.env.REDIS_URL ?? '');
    if (databaseUrl.pathname !== '/love_kitchen_test') {
      throw new Error('E2E requires the exact love_kitchen_test PostgreSQL database');
    }
    if (redisUrl.pathname !== '/15') {
      throw new Error('E2E requires isolated Redis database 15');
    }
    prisma = new PrismaClient();
    redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1 });
    await Promise.all([prisma.$connect(), redis.ping()]);
  });

  afterAll(async () => {
    if (redis) redis.disconnect();
    if (prisma) await prisma.$disconnect();
  });

  it('connects to the dedicated migrated PostgreSQL database', async () => {
    const database = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
    const migrations = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL`;
    expect(database[0]?.current_database).toBe('love_kitchen_test');
    expect(Number(migrations[0]?.count)).toBeGreaterThanOrEqual(2);
  });

  it('uses a dedicated Redis logical database without touching shared keys', async () => {
    const key = `e2e:probe:${process.pid}`;
    await redis.set(key, 'ok', 'EX', 10);
    expect(await redis.get(key)).toBe('ok');
    await redis.del(key);
  });
});
