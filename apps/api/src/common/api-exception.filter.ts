import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp(); const req = ctx.getRequest<Request>(); const res = ctx.getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = error instanceof HttpException ? error.getResponse() : null;
    const structured = typeof body === 'object' && body !== null ? body as { code?: unknown; message?: unknown; details?: unknown } : null;
    const message = structured?.message ?? (typeof body === 'string' ? body : '服务暂时不可用');
    const fallback = status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'KITCHEN_ACCESS_DENIED' : status === 404 ? 'RESOURCE_NOT_FOUND' : 'REQUEST_FAILED';
    res.status(status).json({ success: false, error: { code: typeof structured?.code === 'string' ? structured.code : fallback, message, details: structured?.details ?? null }, ...(req.path.startsWith('/api/v2/') ? { meta: null } : {}), requestId: req.requestId });
  }
}
