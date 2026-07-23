import type { CursorPage, NotificationContract } from '../contracts/api';
import { apiRequest, request } from './request';

export const v2Client = {
  get<T>(path: string) { return request<T>(`/v2${path}`); },
  post<T>(path: string, data?: WechatMiniprogram.IAnyObject, idempotencyKey?: string) { return request<T>(`/v2${path}`, { method: 'POST', ...(data ? { data } : {}), ...(idempotencyKey ? { idempotencyKey } : {}) }); },
  cancelableGet<T>(path: string) { return apiRequest<T>(`/v2${path}`); },
  notifications(kitchenId: string, cursor?: string) { return request<CursorPage<NotificationContract>>(`/v2/kitchens/${kitchenId}/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`); },
};
