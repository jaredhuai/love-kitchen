import { describe, expect, it } from 'vitest';
import { configSchema } from '../src/config/config.schema';

const base = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://db/app',
  REDIS_URL: 'redis://cache/0',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  LOVE_LETTER_ENCRYPTION_KEY: 'c'.repeat(64),
};

describe('production storage configuration', () => {
  it('rejects COS mode unless all private bucket credentials are present', () => {
    const result = configSchema.safeParse({ ...base, UPLOAD_DRIVER: 'cos' });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(['COS_SECRET_ID', 'COS_SECRET_KEY', 'COS_BUCKET', 'COS_REGION']),
      );
  });

  it('accepts complete COS configuration and parses fallback explicitly', () => {
    expect(
      configSchema.parse({
        ...base,
        UPLOAD_DRIVER: 'cos',
        COS_SECRET_ID: 'id',
        COS_SECRET_KEY: 'key',
        COS_BUCKET: 'private-123',
        COS_REGION: 'ap-sydney',
        UPLOAD_COS_FALLBACK_LOCAL: 'false',
      }).UPLOAD_COS_FALLBACK_LOCAL,
    ).toBe(false);
  });

  it('keeps permanent account purge impossible to enable before recovery sign-off', () => {
    expect(
      configSchema.safeParse({ ...base, ACCOUNT_PERMANENT_PURGE_ENABLED: 'true' }).success,
    ).toBe(false);
    expect(configSchema.parse(base).ACCOUNT_PERMANENT_PURGE_ENABLED).toBe(false);
  });
});
