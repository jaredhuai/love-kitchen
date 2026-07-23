import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/common/configure-http-app';

describe('HTTP integration (real AppModule)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    if (new URL(process.env.DATABASE_URL ?? '').pathname !== '/love_kitchen_test') {
      throw new Error('HTTP E2E requires the exact love_kitchen_test database');
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureHttpApp(app);
    await app.init();
  });

  afterAll(async () => { if (app) await app.close(); });

  it('serves health through the production HTTP pipeline', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(response.body).toMatchObject({ success: true, data: { status: 'ok' } });
    expect(response.body.requestId).toEqual(expect.any(String));
  });

  it('enforces global authentication on a private route', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/kitchens/30000000-0000-4000-8000-000000000001/preferences?date=2026-07-15&mealType=DINNER').expect(401);
    expect(response.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });
});
