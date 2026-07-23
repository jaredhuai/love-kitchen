import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp(); const req = http.getRequest<Request>(); const res = http.getResponse();
    if (req.path.startsWith('/api/v1/')) { res.setHeader('Deprecation', 'true'); res.setHeader('Sunset', 'Wed, 31 Dec 2027 23:59:59 GMT'); }
    return next.handle().pipe(map((data) => req.path.startsWith('/api/v2/') ? { success: true, data, meta: null, requestId: req.requestId } : { success: true, data, requestId: req.requestId }));
  }
}
