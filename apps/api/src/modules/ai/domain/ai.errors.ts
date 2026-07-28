import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/app-exception';

export const invalidAiConversationCursor = () =>
  new AppException('INVALID_CURSOR', '分页游标无效', HttpStatus.BAD_REQUEST);
export const aiConversationNotFound = () =>
  new AppException('RESOURCE_NOT_FOUND', 'AI 会话不存在', HttpStatus.NOT_FOUND);
export const aiDisabled = () =>
  new AppException('AI_DISABLED', 'AI 功能当前已关闭', HttpStatus.SERVICE_UNAVAILABLE);
export const aiQuotaExceeded = () =>
  new AppException('AI_QUOTA_EXCEEDED', '今日 AI 使用额度已用完', HttpStatus.TOO_MANY_REQUESTS);
export const aiConcurrencyLimited = () =>
  new AppException('AI_CONCURRENCY_LIMITED', '已有 AI 请求正在处理中', HttpStatus.CONFLICT);
export const aiIdempotencyRequired = () =>
  new AppException(
    'IDEMPOTENCY_KEY_REQUIRED',
    '必须提供 8-200 字符的 Idempotency-Key',
    HttpStatus.BAD_REQUEST,
  );
