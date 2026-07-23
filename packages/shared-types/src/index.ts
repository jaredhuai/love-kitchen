export type ApiSuccess<T> = { success: true; data: T; requestId: string };
export type ApiFailure = { success: false; error: { code: string; message: string; details: unknown }; requestId: string };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
export type KitchenRole = 'OWNER' | 'MEMBER';
export type Pagination = { page: number; pageSize: number; total: number };
