import { HttpException, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RedisService } from '../infra/redis.service';
@Injectable() export class RateLimitMiddleware implements NestMiddleware { constructor(private readonly redis: RedisService) {} async use(req: Request, _res: Response, next: NextFunction) { const key = `rate:${req.ip}:${req.path}`; try { const count = await this.redis.client.incr(key); if (count === 1) await this.redis.client.expire(key, 60); if (count > 120) throw new HttpException('请求过于频繁', 429); } catch (error) { if (error instanceof HttpException) throw error; } next(); } }
