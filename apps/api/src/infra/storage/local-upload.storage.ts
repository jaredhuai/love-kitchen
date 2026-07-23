import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import type { UploadObject, UploadStorageAdapter } from './upload-storage.adapter';

@Injectable()
export class LocalUploadStorage implements UploadStorageAdapter {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  private path(key: string) {
    const root = resolve(this.config.get<string>('UPLOAD_LOCAL_DIR') ?? './uploads');
    const path = resolve(root, key);
    const child = relative(root, path);
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('非法存储路径');
    return path;
  }

  async put(key: string, object: UploadObject) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, object.buffer, { flag: 'wx', mode: 0o600 });
  }

  get(key: string) { return readFile(this.path(key)); }

  async delete(key: string) {
    try {
      await unlink(this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async exists(key: string) {
    try { await access(this.path(key)); return true; } catch { return false; }
  }

  async getPrivateUrl(storageKey: string, expiresInSeconds: number): Promise<string> {
    void storageKey;
    void expiresInSeconds;
    throw new Error('本地存储只允许通过受保护 API 代理读取');
  }
}
