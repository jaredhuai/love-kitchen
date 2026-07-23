import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { UploadsService } from '../src/modules/uploads';
import { configureHttpApp } from '../src/common/configure-http-app';

const KITCHEN_A = '40000000-0000-4000-8000-000000000001';
const KITCHEN_B = '40000000-0000-4000-8000-000000000002';
const USER_A = '40000000-0000-4000-8000-000000000011';
const USER_B = '40000000-0000-4000-8000-000000000012';

describe('Upload security (real AppModule)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let uploadDir: string;
  let tokenA: string;
  let tokenB: string;
  let png: Buffer;

  beforeAll(async () => {
    if (new URL(process.env.DATABASE_URL ?? '').pathname !== '/love_kitchen_test')
      throw new Error('Upload E2E requires love_kitchen_test');
    prisma = new PrismaClient();
    await prisma.$connect();
    await cleanup(prisma);
    await prisma.user.createMany({
      data: [
        { id: USER_A, devKey: 'phase1-upload-a', nickname: '上传A' },
        { id: USER_B, devKey: 'phase1-upload-b', nickname: '上传B' },
      ],
    });
    await prisma.kitchen.createMany({
      data: [
        { id: KITCHEN_A, name: '上传厨房A', createdBy: USER_A },
        { id: KITCHEN_B, name: '上传厨房B', createdBy: USER_B },
      ],
    });
    await prisma.kitchenMember.createMany({
      data: [
        { kitchenId: KITCHEN_A, userId: USER_A, role: 'OWNER' },
        { kitchenId: KITCHEN_B, userId: USER_B, role: 'OWNER' },
      ],
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureHttpApp(app);
    await app.init();
    uploadDir = resolve(app.get(ConfigService).get<string>('UPLOAD_LOCAL_DIR') ?? './uploads');
    const jwt = app.get(JwtService);
    const options = {
      secret: app.get(ConfigService).getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: '5m' as const,
    };
    [tokenA, tokenB] = await Promise.all([
      jwt.signAsync({ sub: USER_A }, options),
      jwt.signAsync({ sub: USER_B }, options),
    ]);
    png = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#ff3366' } })
      .png()
      .toBuffer();
  });

  afterAll(async () => {
    if (prisma && app) {
      await prisma.uploadFile.updateMany({
        where: { kitchenId: { in: [KITCHEN_A, KITCHEN_B] }, deletedAt: null },
        data: { deletedAt: new Date(0), status: 'DELETED' },
      });
      await app.get(UploadsService).cleanupDeleted(new Date());
    }
    if (prisma) await cleanup(prisma);
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (uploadDir) await rm(join(uploadDir, KITCHEN_A), { recursive: true, force: true });
  });

  it('fully decodes and re-encodes a valid image as private WebP', async () => {
    const response = await upload(tokenA, png, 'photo.png', 'image/png').expect(201);
    const file = response.body.data;
    expect(file.mimeType).toBe('image/webp');
    expect(file.storageKey).toMatch(new RegExp(`^${KITCHEN_A}/[0-9a-f-]+\\.webp$`));
    expect(file.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(file.storageDriver).toBe('LOCAL');
    expect(file.status).toBe('ACTIVE');
    expect(file.thumbnailKey).toMatch(new RegExp(`^${KITCHEN_A}/[0-9a-f-]+\\.thumb\\.webp$`));
    const stored = await readFile(join(uploadDir, file.storageKey));
    const thumbnail = await readFile(join(uploadDir, file.thumbnailKey));
    expect((await sharp(stored).metadata()).format).toBe('webp');
    expect((await sharp(thumbnail).metadata()).width).toBeLessThanOrEqual(320);
    const fetched = await request(app.getHttpServer())
      .get(path(KITCHEN_A, file.id))
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(fetched.headers['content-type']).toMatch(/^image\/webp/);
    expect(fetched.headers['x-content-type-options']).toBe('nosniff');
    expect(fetched.headers['cache-control']).toBe('private, no-store');
    await request(app.getHttpServer())
      .get(`${path(KITCHEN_A, file.id)}/thumbnail`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200)
      .expect('Content-Type', /image\/webp/);
  });

  it('detects original object checksum corruption without exposing bytes', async () => {
    const created = await upload(tokenA, png, 'checksum.png', 'image/png').expect(201);
    await writeFile(join(uploadDir, created.body.data.storageKey), Buffer.from('tampered'));
    await request(app.getHttpServer())
      .get(path(KITCHEN_A, created.body.data.id))
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });

  it('keeps an expanded legacy Local record readable before checksum backfill', async () => {
    const storageKey = `${KITCHEN_A}/legacy-before-backfill.webp`;
    const bytes = await sharp(png).webp().toBuffer();
    await mkdir(join(uploadDir, KITCHEN_A), { recursive: true });
    await writeFile(join(uploadDir, storageKey), bytes);
    const legacy = await prisma.uploadFile.create({
      data: {
        kitchenId: KITCHEN_A,
        storageKey,
        checksum: null,
        storageDriver: 'LOCAL',
        status: 'ACTIVE',
        mimeType: 'image/webp',
        sizeBytes: bytes.length,
        originalName: 'legacy.png',
        createdBy: USER_A,
      },
    });
    const response = await request(app.getHttpServer())
      .get(path(KITCHEN_A, legacy.id))
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(Buffer.from(response.body)).toEqual(bytes);
  });

  it('rejects MIME and actual format mismatches', async () => {
    expect((await upload(tokenA, png, 'photo.jpg', 'image/jpeg').expect(400)).body.error.code).toBe(
      'UPLOAD_INVALID_CONTENT',
    );
    await upload(tokenA, png, 'photo.png', 'image/jpeg').expect(400);
  });

  it('rejects double extensions and unsupported formats', async () => {
    await upload(tokenA, png, 'photo.png.exe', 'image/png').expect(400);
    await upload(
      tokenA,
      Buffer.from('<svg><script>alert(1)</script></svg>'),
      'photo.svg',
      'image/svg+xml',
    ).expect(400);
  });

  it('rejects corrupt image content even when its signature looks valid', async () => {
    const fakePng = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      Buffer.from('not-an-image'),
    ]);
    await upload(tokenA, fakePng, 'photo.png', 'image/png').expect(400);
  });

  it('rejects requests above the hard 10 MiB limit before persistence', async () => {
    await upload(tokenA, Buffer.alloc(10 * 1024 * 1024 + 1), 'large.png', 'image/png').expect(413);
  });

  it('does not expose an existing file through another kitchen', async () => {
    const created = await upload(tokenA, png, 'private.png', 'image/png').expect(201);
    await request(app.getHttpServer())
      .get(path(KITCHEN_B, created.body.data.id))
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete(path(KITCHEN_B, created.body.data.id))
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('soft-deletes metadata and removes the private object', async () => {
    const created = await upload(tokenA, png, 'delete.png', 'image/png').expect(201);
    const file = created.body.data;
    await request(app.getHttpServer())
      .delete(path(KITCHEN_A, file.id))
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(path(KITCHEN_A, file.id))
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    await expect(readFile(join(uploadDir, file.storageKey))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('cleans orphaned metadata without deleting active objects', async () => {
    const old = await upload(tokenA, png, 'orphan.png', 'image/png').expect(201);
    const active = await upload(tokenA, png, 'active.png', 'image/png').expect(201);
    await prisma.uploadFile.update({
      where: { id: old.body.data.id },
      data: { deletedAt: new Date('2026-01-01'), status: 'DELETED' },
    });
    expect(await app.get(UploadsService).cleanupDeleted(new Date('2026-02-01'))).toBe(1);
    expect(await prisma.uploadFile.findUnique({ where: { id: old.body.data.id } })).toBeNull();
    expect(
      await prisma.uploadFile.findUnique({ where: { id: active.body.data.id } }),
    ).not.toBeNull();
    await expect(readFile(join(uploadDir, old.body.data.storageKey))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(join(uploadDir, active.body.data.storageKey))).resolves.toBeInstanceOf(
      Buffer,
    );
  });

  function upload(token: string, buffer: Buffer, filename: string, mime: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/kitchens/${KITCHEN_A}/uploads`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, { filename, contentType: mime });
  }
});

function path(kitchenId: string, fileId: string) {
  return `/api/v1/kitchens/${kitchenId}/uploads/${fileId}`;
}

async function cleanup(prisma: PrismaClient) {
  const kitchens = [KITCHEN_A, KITCHEN_B];
  const users = [USER_A, USER_B];
  await prisma.auditLog.deleteMany({
    where: { OR: [{ kitchenId: { in: kitchens } }, { userId: { in: users } }] },
  });
  await prisma.outboxEvent.deleteMany({ where: { kitchenId: { in: kitchens } } });
  await prisma.uploadFile.deleteMany({ where: { kitchenId: { in: kitchens } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: users } } });
  await prisma.kitchenMember.deleteMany({ where: { kitchenId: { in: kitchens } } });
  await prisma.kitchen.deleteMany({ where: { id: { in: kitchens } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}
