import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) { const id = req.header('x-request-id') ?? randomUUID(); req.requestId = id; res.setHeader('x-request-id', id); next(); }
}
declare global {
  // Express uses declaration merging for request-scoped authenticated context.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { requestId: string; user?: { id: string }; kitchen?: unknown; membership?: unknown; } }
}
