import { ConfigService } from '@nestjs/config';
import { UploadStorageDriver } from '@prisma/client';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/infra/prisma.service';
import type { LocalUploadStorage } from '../src/infra/storage/local-upload.storage';
import type { UploadStorageAdapter } from '../src/infra/storage/upload-storage.adapter';
import { UploadsService } from '../src/modules/uploads';

describe('Uploads storage routing', () => {
  it('falls back atomically to Local when COS upload fails', async () => {
    const objects = new Map<string, Buffer>();
    const local = memoryStorage(objects);
    const primary = memoryStorage(new Map());
    primary.put = vi.fn().mockRejectedValue(new Error('COS unavailable'));
    const create = vi.fn().mockImplementation(async ({ data }) => ({ id: 'file-id', ...data }));
    const service = new UploadsService(
      { uploadFile: { create } } as unknown as PrismaService,
      config({ UPLOAD_DRIVER: 'cos', UPLOAD_COS_FALLBACK_LOCAL: true }),
      primary,
      local as unknown as LocalUploadStorage,
    );
    const png = await sharp({
      create: { width: 20, height: 10, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();
    const result = await service.save(
      '40000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000011',
      { buffer: png, size: png.length, mimetype: 'image/png', originalname: 'safe.png' },
    );
    expect(result.storageDriver).toBe(UploadStorageDriver.LOCAL);
    expect(objects.has(result.storageKey)).toBe(true);
    expect(result.thumbnailKey).not.toBeNull();
    expect(objects.has(result.thumbnailKey!)).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
          storageDriver: 'LOCAL',
        }),
      }),
    );
  });

  it('dual-reads a COS record from Local fallback when COS is unavailable', async () => {
    const bytes = Buffer.from('private-image');
    const checksum = (await import('node:crypto')).createHash('sha256').update(bytes).digest('hex');
    const local = memoryStorage(new Map([['kitchen/file.webp', bytes]]));
    const primary = memoryStorage(new Map());
    primary.get = vi.fn().mockRejectedValue(new Error('COS unavailable'));
    const service = new UploadsService(
      {
        uploadFile: {
          findFirst: vi
            .fn()
            .mockResolvedValue({
              id: 'file-id',
              storageKey: 'kitchen/file.webp',
              thumbnailKey: null,
              storageDriver: 'COS',
              checksum,
              mimeType: 'image/webp',
            }),
        },
      } as unknown as PrismaService,
      config({ UPLOAD_DRIVER: 'cos', UPLOAD_COS_FALLBACK_LOCAL: true }),
      primary,
      local as unknown as LocalUploadStorage,
    );
    await expect(service.read('kitchen', 'file-id')).resolves.toMatchObject({ buffer: bytes });
  });
});

function config(values: Record<string, unknown>) {
  return { get: vi.fn((key: string) => values[key]) } as unknown as ConfigService;
}

function memoryStorage(objects: Map<string, Buffer>): UploadStorageAdapter {
  return {
    put: vi.fn(async (key, object) => {
      objects.set(key, object.buffer);
    }),
    get: vi.fn(async (key) => {
      const value = objects.get(key);
      if (!value) throw new Error('NotFound');
      return value;
    }),
    delete: vi.fn(async (key) => {
      objects.delete(key);
    }),
    exists: vi.fn(async (key) => objects.has(key)),
    getPrivateUrl: vi.fn(async (key) => `https://private.invalid/${key}`),
  };
}
