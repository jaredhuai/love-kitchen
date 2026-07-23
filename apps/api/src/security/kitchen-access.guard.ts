import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../infra/prisma.service';
import { AppException } from '../common/app-exception';
@Injectable()
export class KitchenAccessGuard implements CanActivate {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>(); const rawKitchenId = req.params.kitchenId; const kitchenId = Array.isArray(rawKitchenId) ? rawKitchenId[0] : rawKitchenId; const userId = req.user?.id;
    if (!kitchenId || !userId) throw new ForbiddenException('无权访问该厨房');
    const membership = await this.prisma.kitchenMember.findFirst({ where: { kitchenId, userId, status: 'ACTIVE', kitchen: { deletedAt: null } }, include: { kitchen: true } });
    if (!membership) throw new AppException('KITCHEN_ACCESS_DENIED', '厨房不存在或无权访问', 404);
    req.kitchen = membership.kitchen; req.membership = membership; return true;
  }
}
