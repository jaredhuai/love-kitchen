import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import COS from 'cos-nodejs-sdk-v5';
import type { UploadObject, UploadStorageAdapter } from './upload-storage.adapter';

@Injectable()
export class CosUploadStorage implements UploadStorageAdapter {
  private readonly client: COS;
  private readonly bucket: string;
  private readonly region: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.bucket = config.getOrThrow<string>('COS_BUCKET');
    this.region = config.getOrThrow<string>('COS_REGION');
    this.client = new COS({
      SecretId: config.getOrThrow<string>('COS_SECRET_ID'),
      SecretKey: config.getOrThrow<string>('COS_SECRET_KEY'),
    });
  }

  async put(key: string, object: UploadObject) {
    await this.client.putObject({ Bucket: this.bucket, Region: this.region, Key: key, Body: object.buffer, ContentType: object.contentType });
  }

  async get(key: string) {
    const result = await this.client.getObject({ Bucket: this.bucket, Region: this.region, Key: key });
    return Buffer.isBuffer(result.Body) ? result.Body : Buffer.from(result.Body as string);
  }

  async getPrivateUrl(key: string, expiresInSeconds: number) {
    return this.client.getObjectUrl({ Bucket: this.bucket, Region: this.region, Key: key, Sign: true, Expires: expiresInSeconds });
  }

  async delete(key: string) {
    await this.client.deleteObject({ Bucket: this.bucket, Region: this.region, Key: key });
  }

  async exists(key: string) {
    try {
      await this.client.headObject({ Bucket: this.bucket, Region: this.region, Key: key });
      return true;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404) return false;
      throw error;
    }
  }
}
