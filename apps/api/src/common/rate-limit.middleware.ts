import { HttpException, Injectable, NestMiddleware } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { RedisService } from '../infra/redis.service';

const WINDOW_SECONDS = 60;
const AUTHENTICATED_ROUTE_LIMIT = 240;
const PUBLIC_ROUTE_LIMIT = 120;
const IP_GLOBAL_LIMIT = 1200;

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(private readonly redis: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const authorization = req.header('authorization') || '';
    const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const identity = bearerToken
      ? `session:${createHash('sha256').update(bearerToken).digest('hex').slice(0, 24)}`
      : `ip:${req.ip}`;
    const routeKey = `rate:route:${identity}:${req.method}:${req.path}`;
    const ipKey = `rate:ip:${req.ip}`;

    try {
      const [routeCount, ipCount] = await Promise.all([
        this.increment(routeKey),
        this.increment(ipKey),
      ]);
      const routeLimit = bearerToken ? AUTHENTICATED_ROUTE_LIMIT : PUBLIC_ROUTE_LIMIT;
      if (routeCount > routeLimit || ipCount > IP_GLOBAL_LIMIT) {
        res.setHeader('Retry-After', String(WINDOW_SECONDS));
        throw new HttpException('请求过于频繁', 429);
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Redis 暂时不可用时放行，避免限流基础设施阻断核心业务。
    }
    next();
  }

  private async increment(key: string) {
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, WINDOW_SECONDS);
    return count;
  }
}
