import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { KitchenAccessGuard } from '../src/security/kitchen-access.guard';
import type { PrismaService } from '../src/infra/prisma.service';

type RequestLike = { params: { kitchenId: string }; user: { id: string }; kitchen?: unknown; membership?: unknown };
type ContextLike = { switchToHttp: () => { getRequest: () => RequestLike } };
type FakePrisma = { kitchenMember: { findFirst: ReturnType<typeof vi.fn> } };

describe('KitchenAccessGuard', () => {
  it('拒绝不存在或不属于当前用户的厨房', async () => {
    const prisma: FakePrisma = { kitchenMember: { findFirst: vi.fn().mockResolvedValue(null) } };
    const guard = new KitchenAccessGuard(prisma as unknown as PrismaService);
    const req: RequestLike = { params: { kitchenId: 'kitchen-b' }, user: { id: 'user-a' } };
    const context: ContextLike = { switchToHttp: () => ({ getRequest: () => req }) };
    await expect(guard.canActivate(context as unknown as ExecutionContext)).rejects.toMatchObject({ response: { code: 'KITCHEN_ACCESS_DENIED' }, status: 404 });
    expect(prisma.kitchenMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ kitchenId: 'kitchen-b', userId: 'user-a' }) }));
  });

  it('只把有效成员关系写入可信请求上下文', async () => {
    const membership = { kitchenId: 'kitchen-a', userId: 'user-a', status: 'ACTIVE', kitchen: { id: 'kitchen-a', deletedAt: null } };
    const prisma: FakePrisma = { kitchenMember: { findFirst: vi.fn().mockResolvedValue(membership) } };
    const guard = new KitchenAccessGuard(prisma as unknown as PrismaService);
    const req: RequestLike = { params: { kitchenId: 'kitchen-a' }, user: { id: 'user-a' } };
    const context: ContextLike = { switchToHttp: () => ({ getRequest: () => req }) };
    await expect(guard.canActivate(context as unknown as ExecutionContext)).resolves.toBe(true);
    expect(req.kitchen).toEqual(membership.kitchen);
    expect(req.membership).toEqual(membership);
  });
});
