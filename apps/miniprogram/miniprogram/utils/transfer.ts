import { ENV } from '../config/env';
import type { ApiEnvelope } from '../contracts/api';
import { getAccessToken } from '../stores/auth.store';
import { ClientApiError, toClientError } from './api-error';

export type Transfer<T> = { promise: Promise<T>; abort(): void; onProgress(listener: (percent: number) => void): void };

export function uploadFile<T>(path: string, filePath: string, name = 'file', formData: Record<string, string> = {}): Transfer<T> {
  let listener: (percent: number) => void = () => undefined;
  let task: WechatMiniprogram.UploadTask | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    task = wx.uploadFile({
      url: `${ENV.apiBaseUrl}${versioned(path)}`, filePath, name, formData,
      header: { Authorization: `Bearer ${getAccessToken()}` },
      success: (response) => {
        let envelope: ApiEnvelope<T>;
        try { envelope = JSON.parse(response.data) as ApiEnvelope<T>; }
        catch { return reject(new ClientApiError('INVALID_RESPONSE', '服务返回了无法识别的数据', response.statusCode)); }
        if (response.statusCode >= 200 && response.statusCode < 300 && envelope.success) resolve(envelope.data);
        else reject(toClientError(response.statusCode, envelope.success ? undefined : envelope.error));
      },
      fail: (error) => reject(new ClientApiError(/abort/i.test(error.errMsg) ? 'REQUEST_ABORTED' : 'NETWORK_ERROR', error.errMsg || '上传失败', 0)),
    });
    task.onProgressUpdate(({ progress }) => listener(progress));
  });
  return { promise, abort: () => task?.abort(), onProgress: (value) => { listener = value; } };
}

export function downloadFile(path: string): Transfer<string> {
  let listener: (percent: number) => void = () => undefined;
  let task: WechatMiniprogram.DownloadTask | undefined;
  const promise = new Promise<string>((resolve, reject) => {
    task = wx.downloadFile({
      url: `${ENV.apiBaseUrl}${versioned(path)}`,
      header: { Authorization: `Bearer ${getAccessToken()}` },
      success: (response) => response.statusCode >= 200 && response.statusCode < 300 ? resolve(response.tempFilePath) : reject(toClientError(response.statusCode)),
      fail: (error) => reject(new ClientApiError(/abort/i.test(error.errMsg) ? 'REQUEST_ABORTED' : 'NETWORK_ERROR', error.errMsg || '下载失败', 0)),
    });
    task.onProgressUpdate(({ progress }) => listener(progress));
  });
  return { promise, abort: () => task?.abort(), onProgress: (value) => { listener = value; } };
}

function versioned(path: string) { return /^\/v\d+\//.test(path) ? path : `/v1${path}`; }
