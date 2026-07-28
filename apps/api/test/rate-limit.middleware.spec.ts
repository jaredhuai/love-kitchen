import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { RateLimitMiddleware } from '../src/common/rate-limit.middleware';

describe('RateLimitMiddleware', () => {
  it('uses separate route buckets for different authenticated sessions behind one IP', async () => {
    const counts = new Map<string, number>();
    const redis = {
      client: {
        incr: vi.fn(async (key: string) => {
          const count = (counts.get(key) || 0) + 1;
          counts.set(key, count);
          return count;
        }),
        expire: vi.fn(async () => 1),
      },
    };
    const middleware = new RateLimitMiddleware(redis as never);
    const response = { setHeader: vi.fn() } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    await middleware.use(request('token-a'), response, next);
    await middleware.use(request('token-b'), response, next);

    const routeKeys = [...counts.keys()].filter((key) => key.startsWith('rate:route:'));
    expect(routeKeys).toHaveLength(2);
    expect(counts.get('rate:ip:127.0.0.1')).toBe(2);
    expect(next).toHaveBeenCalledTimes(2);
  });
});

function request(token: string) {
  return {
    ip: '127.0.0.1',
    method: 'GET',
    path: '/api/v1/kitchens/kitchen-id/dishes',
    header: (name: string) => name.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined,
  } as unknown as Request;
}
