export const UPLOAD_STORAGE = Symbol('UPLOAD_STORAGE');

export type UploadObject = { buffer: Buffer; contentType: string; sizeBytes?: number; originalName?: string };

export interface UploadStorageAdapter {
  put(storageKey: string, object: UploadObject): Promise<void>;
  get(storageKey: string): Promise<Buffer>;
  getPrivateUrl(storageKey: string, expiresInSeconds: number): Promise<string>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}
