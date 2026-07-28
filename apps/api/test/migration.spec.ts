import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('Migration contract on dedicated PostgreSQL', () => {
  let prisma: PrismaClient;
  beforeAll(async () => {
    if (new URL(process.env.DATABASE_URL ?? '').pathname !== '/love_kitchen_test')
      throw new Error('Migration test requires love_kitchen_test');
    prisma = new PrismaClient();
    await prisma.$connect();
  });
  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('has every repository migration applied exactly once and without failure', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>
    >`
      SELECT "migration_name", "finished_at", "rolled_back_at" FROM "_prisma_migrations" ORDER BY "migration_name"
    `;
    expect(rows.map((row) => row.migration_name)).toEqual([
      '20260710081446_pnpm_db_seedpnpm_dev',
      '20260712090000_preference_state_machine',
      '20260712130000_outbox_audit',
      '20260712150000_love_letter_key_version',
      '20260713010000_api_v2_idempotency',
      '20260720090000_identity_sessions',
      '20260720120000_upload_storage_metadata',
      '20260720150000_data_export_account_deletion',
      '20260720180000_ai_orchestrator_usage',
      '20260720210000_business_event_consumers',
    ]);
    expect(rows.every((row) => row.finished_at && !row.rolled_back_at)).toBe(true);
  });

  it('exposes the Phase 1 state, outbox, audit-idempotency and key-version columns', async () => {
    const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT "table_name", "column_name" FROM information_schema.columns
      WHERE table_schema = 'public' AND (
        (table_name = 'MealPreferenceSession' AND column_name IN ('state','version','closedAt')) OR
        (table_name = 'AuditLog' AND column_name = 'outboxEventId') OR
        (table_name = 'OutboxEvent' AND column_name IN ('status','attempts','availableAt')) OR
        (table_name = 'LoveLetter' AND column_name = 'keyVersion')
      )
    `;
    expect(columns).toHaveLength(8);
  });

  it('exposes the M2 identity, session and security-event schema without secret fields', async () => {
    const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT "table_name", "column_name" FROM information_schema.columns
      WHERE table_schema = 'public' AND "table_name" IN ('WechatIdentity', 'RefreshTokenSession', 'SecurityEvent')
    `;
    const names = new Set(columns.map((column) => `${column.table_name}.${column.column_name}`));
    expect([...names]).toEqual(
      expect.arrayContaining([
        'WechatIdentity.appId',
        'WechatIdentity.openId',
        'WechatIdentity.unionId',
        'RefreshTokenSession.familyId',
        'RefreshTokenSession.tokenHash',
        'RefreshTokenSession.rotatedFromId',
        'RefreshTokenSession.reuseDetectedAt',
        'SecurityEvent.eventType',
        'SecurityEvent.severity',
        'SecurityEvent.metadata',
      ]),
    );
    expect([...names].some((name) => /session.?key|refresh.?token$/i.test(name))).toBe(false);
  });

  it('backfills legacy identity and refresh rows idempotently', async () => {
    const userId = '76000000-0000-4000-8000-000000000001';
    const tokenId = '76000000-0000-4000-8000-000000000002';
    await prisma.user.create({
      data: {
        id: userId,
        devKey: 'm2-backfill',
        wechatOpenId: 'legacy-open-id-m2',
        nickname: 'M2',
      },
    });
    await prisma.refreshToken.create({
      data: {
        id: tokenId,
        userId,
        tokenHash: 'm2-backfill-token-hash',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    try {
      const sql = readFileSync(
        join(__dirname, '../prisma/backfills/m2_identity_sessions.sql'),
        'utf8',
      );
      for (let attempt = 0; attempt < 2; attempt += 1) {
        for (const statement of sql
          .split(/;\s*(?=INSERT)/)
          .map((part) => part.trim())
          .filter(Boolean))
          await prisma.$executeRawUnsafe(statement);
      }
      expect(await prisma.wechatIdentity.findMany({ where: { userId } })).toEqual([
        expect.objectContaining({ appId: 'legacy-unscoped', openId: 'legacy-open-id-m2' }),
      ]);
      expect(await prisma.refreshTokenSession.findMany({ where: { userId } })).toEqual([
        expect.objectContaining({
          id: tokenId,
          familyId: tokenId,
          tokenHash: 'm2-backfill-token-hash',
        }),
      ]);
    } finally {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  it('exposes M5 upload routing, integrity and thumbnail metadata', async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string; is_nullable: string }>>`
      SELECT "column_name", "is_nullable" FROM information_schema.columns
      WHERE table_schema = 'public' AND "table_name" = 'UploadFile'
        AND "column_name" IN ('storageDriver','checksum','status','thumbnailKey')
      ORDER BY "column_name"
    `;
    expect(columns.map(({ column_name }) => column_name)).toEqual([
      'checksum',
      'status',
      'storageDriver',
      'thumbnailKey',
    ]);
    expect(columns.find(({ column_name }) => column_name === 'storageDriver')?.is_nullable).toBe(
      'NO',
    );
    expect(columns.find(({ column_name }) => column_name === 'status')?.is_nullable).toBe('NO');
  });

  it('exposes M4 export/deletion jobs and reversible user state', async () => {
    const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT "table_name", "column_name" FROM information_schema.columns
      WHERE table_schema = 'public' AND (
        ("table_name" = 'User' AND "column_name" IN ('status','deactivatedAt')) OR
        ("table_name" = 'DataExportJob' AND "column_name" IN ('userId','requestKey','status','result','expiresAt','attempts')) OR
        ("table_name" = 'AccountDeletionJob' AND "column_name" IN ('userId','requestKey','status','scheduledFor','recoveryTokenHash','dryRun','attempts'))
      )
    `;
    const names = new Set(
      columns.map(({ table_name, column_name }) => `${table_name}.${column_name}`),
    );
    expect(names).toEqual(
      new Set([
        'User.status',
        'User.deactivatedAt',
        'DataExportJob.userId',
        'DataExportJob.requestKey',
        'DataExportJob.status',
        'DataExportJob.result',
        'DataExportJob.expiresAt',
        'DataExportJob.attempts',
        'AccountDeletionJob.userId',
        'AccountDeletionJob.requestKey',
        'AccountDeletionJob.status',
        'AccountDeletionJob.scheduledFor',
        'AccountDeletionJob.recoveryTokenHash',
        'AccountDeletionJob.dryRun',
        'AccountDeletionJob.attempts',
      ]),
    );
  });

  it('exposes AI idempotency, cost, latency and retention metadata', async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT "column_name" FROM information_schema.columns
      WHERE table_schema = 'public' AND "table_name" = 'AiUsageRecord'
    `;
    const names = new Set(columns.map(({ column_name }) => column_name));
    expect([...names]).toEqual(
      expect.arrayContaining([
        'userId',
        'kitchenId',
        'requestKey',
        'status',
        'provider',
        'model',
        'estimatedInputTokens',
        'estimatedOutputTokens',
        'costMicros',
        'latencyMs',
        'response',
        'errorCode',
        'expiresAt',
      ]),
    );
  });

  it('exposes business consumer receipts, notification sources and scheduler dedupe', async () => {
    const columns = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT "table_name", "column_name" FROM information_schema.columns
      WHERE table_schema = 'public' AND (
        ("table_name" = 'ConsumerReceipt' AND "column_name" IN ('outboxEventId','consumer','processedAt')) OR
        ("table_name" = 'Notification' AND "column_name" IN ('sourceEventId','sourceKey')) OR
        ("table_name" = 'OutboxEvent' AND "column_name" = 'dedupeKey')
      )
    `;
    expect(columns.map(({ table_name, column_name }) => `${table_name}.${column_name}`)).toEqual(
      expect.arrayContaining([
        'ConsumerReceipt.outboxEventId',
        'ConsumerReceipt.consumer',
        'ConsumerReceipt.processedAt',
        'Notification.sourceEventId',
        'Notification.sourceKey',
        'OutboxEvent.dedupeKey',
      ]),
    );
  });
});
