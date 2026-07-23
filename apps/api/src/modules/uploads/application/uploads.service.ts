import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import sharp from 'sharp';
import type { Metadata, Sharp } from 'sharp';
import { UploadFileStatus, UploadStorageDriver } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma.service';
import { LocalUploadStorage } from '../../../infra/storage/local-upload.storage';
import {
  UPLOAD_STORAGE,
  type UploadStorageAdapter,
} from '../../../infra/storage/upload-storage.adapter';
import { invalidUpload, uploadNotFound } from '../domain/upload.errors';

const INPUT_FORMATS = {
  jpeg: { mime: 'image/jpeg', extensions: new Set(['.jpg', '.jpeg']) },
  png: { mime: 'image/png', extensions: new Set(['.png']) },
  webp: { mime: 'image/webp', extensions: new Set(['.webp']) },
} as const;
export const HARD_MAX_BYTES = 10 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;

export type IncomingFile = { buffer: Buffer; mimetype: string; size: number; originalname: string };

@Injectable()
export class UploadsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(UPLOAD_STORAGE) private readonly storage: UploadStorageAdapter,
    @Inject(LocalUploadStorage) private readonly localStorage: LocalUploadStorage,
  ) {}

  async save(kitchenId: string, userId: string, file: IncomingFile) {
    const configuredMax = Number(this.config.get('MAX_UPLOAD_SIZE_MB') ?? 10) * 1024 * 1024;
    const maxBytes = Math.min(configuredMax, HARD_MAX_BYTES);
    if (!file.buffer.length || file.size !== file.buffer.length || file.size > maxBytes) {
      throw invalidUpload('图片为空、大小不一致或超过限制');
    }
    const extension = extname(file.originalname).toLowerCase();
    let image: Sharp;
    let metadata: Metadata;
    try {
      image = sharp(file.buffer, {
        failOn: 'warning',
        limitInputPixels: MAX_INPUT_PIXELS,
        animated: false,
      });
      metadata = await image.metadata();
    } catch {
      throw invalidUpload('图片无法安全解码');
    }
    const input =
      metadata.format && metadata.format in INPUT_FORMATS
        ? INPUT_FORMATS[metadata.format as keyof typeof INPUT_FORMATS]
        : undefined;
    if (!input || input.mime !== file.mimetype || !input.extensions.has(extension as never)) {
      throw invalidUpload('图片 MIME、扩展名和实际格式不一致');
    }

    let buffer: Buffer;
    try {
      buffer = await image.rotate().webp({ quality: 85, effort: 4 }).toBuffer();
    } catch {
      throw invalidUpload('图片重编码失败');
    }
    const objectId = randomUUID();
    const key = `${kitchenId}/${objectId}.webp`;
    const thumbnailKey = `${kitchenId}/${objectId}.thumb.webp`;
    const safeOriginalName =
      basename(file.originalname)
        .replace(/[\u0000-\u001f\u007f]/g, '_')
        .slice(0, 200) || 'image';
    const thumbnail = await sharp(buffer)
      .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    const storageDriver = await this.putPairWithFallback(
      key,
      buffer,
      thumbnailKey,
      thumbnail,
      safeOriginalName,
    );
    const checksum = createHash('sha256').update(buffer).digest('hex');
    try {
      const record = await this.prisma.uploadFile.create({
        data: {
          kitchenId,
          storageKey: key,
          storageDriver,
          checksum,
          status: UploadFileStatus.ACTIVE,
          thumbnailKey,
          mimeType: 'image/webp',
          sizeBytes: buffer.length,
          originalName: safeOriginalName,
          createdBy: userId,
        },
      });
      return record;
    } catch (error) {
      await this.deleteObjects(storageDriver, [key, thumbnailKey]);
      throw error;
    }
  }

  async read(kitchenId: string, id: string, thumbnail = false) {
    const file = await this.prisma.uploadFile.findFirst({
      where: { id, kitchenId, deletedAt: null, status: UploadFileStatus.ACTIVE },
    });
    if (!file) throw uploadNotFound();
    try {
      const key = thumbnail ? file.thumbnailKey : file.storageKey;
      if (!key) throw new Error('MissingThumbnail');
      const buffer = await this.getWithFallback(file.storageDriver, key);
      if (
        !thumbnail &&
        file.checksum &&
        createHash('sha256').update(buffer).digest('hex') !== file.checksum
      )
        throw new Error('ChecksumMismatch');
      return { file, buffer };
    } catch {
      throw uploadNotFound();
    }
  }

  async remove(kitchenId: string, id: string) {
    const file = await this.prisma.uploadFile.findFirst({
      where: { id, kitchenId, deletedAt: null, status: UploadFileStatus.ACTIVE },
    });
    if (!file) throw uploadNotFound();
    const deleted = await this.prisma.uploadFile.updateMany({
      where: { id, kitchenId, deletedAt: null, status: UploadFileStatus.ACTIVE },
      data: { deletedAt: new Date(), status: UploadFileStatus.DELETED },
    });
    if (deleted.count !== 1) throw uploadNotFound();
    await this.deleteObjects(file.storageDriver, [file.storageKey, file.thumbnailKey]);
    return { id, deleted: true };
  }

  async cleanupDeleted(before: Date) {
    const files = await this.prisma.uploadFile.findMany({
      where: { deletedAt: { lte: before }, status: UploadFileStatus.DELETED },
      take: 100,
    });
    let removed = 0;
    for (const file of files) {
      await this.deleteObjects(file.storageDriver, [file.storageKey, file.thumbnailKey]);
      const result = await this.prisma.uploadFile.deleteMany({
        where: { id: file.id, deletedAt: { lte: before } },
      });
      removed += result.count;
    }
    return removed;
  }

  private async putPairWithFallback(
    key: string,
    buffer: Buffer,
    thumbnailKey: string,
    thumbnail: Buffer,
    originalName: string,
  ) {
    const preferred =
      this.config.get('UPLOAD_DRIVER') === 'cos'
        ? UploadStorageDriver.COS
        : UploadStorageDriver.LOCAL;
    try {
      await this.storage.put(key, {
        buffer,
        contentType: 'image/webp',
        sizeBytes: buffer.length,
        originalName,
      });
      await this.storage.put(thumbnailKey, {
        buffer: thumbnail,
        contentType: 'image/webp',
        sizeBytes: thumbnail.length,
        originalName,
      });
      return preferred;
    } catch (error) {
      await Promise.allSettled([this.storage.delete(key), this.storage.delete(thumbnailKey)]);
      if (
        preferred !== UploadStorageDriver.COS ||
        this.config.get('UPLOAD_COS_FALLBACK_LOCAL') === false
      )
        throw error;
      await this.localStorage.put(key, {
        buffer,
        contentType: 'image/webp',
        sizeBytes: buffer.length,
        originalName,
      });
      try {
        await this.localStorage.put(thumbnailKey, {
          buffer: thumbnail,
          contentType: 'image/webp',
          sizeBytes: thumbnail.length,
          originalName,
        });
      } catch (fallbackError) {
        await this.localStorage.delete(key);
        throw fallbackError;
      }
      return UploadStorageDriver.LOCAL;
    }
  }

  private async getWithFallback(driver: UploadStorageDriver, key: string) {
    if (driver === UploadStorageDriver.LOCAL) return this.localStorage.get(key);
    try {
      return await this.storage.get(key);
    } catch (error) {
      if (this.config.get('UPLOAD_COS_FALLBACK_LOCAL') === false) throw error;
      return this.localStorage.get(key);
    }
  }

  private async deleteObjects(driver: UploadStorageDriver, keys: Array<string | null>) {
    const storage = driver === UploadStorageDriver.LOCAL ? this.localStorage : this.storage;
    await Promise.all(
      keys
        .filter((key): key is string => Boolean(key))
        .map(async (key) => {
          await storage.delete(key);
          if (
            driver === UploadStorageDriver.COS &&
            this.config.get('UPLOAD_COS_FALLBACK_LOCAL') !== false
          )
            await this.localStorage.delete(key);
        }),
    );
  }
}
