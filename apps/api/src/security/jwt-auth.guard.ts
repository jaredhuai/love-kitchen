import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { IS_PUBLIC } from './public.decorator';
import { PrismaService } from '../infra/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,

    @Inject(JwtService)
    private readonly jwt: JwtService,

    @Inject(ConfigService)
    private readonly config: ConfigService,

    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;
    const token = authorization?.match(/^Bearer (.+)$/)?.[1];

    if (!token) {
      throw new UnauthorizedException('请先登录');
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      const active = await this.prisma.user.count({
        where: { id: payload.sub, status: { in: ['ACTIVE', 'DELETION_PENDING'] } },
      });
      if (active !== 1) throw new UnauthorizedException('账号当前不可用');

      request.user = {
        id: payload.sub,
      };

      return true;
    } catch {
      throw new UnauthorizedException('登录已过期');
    }
  }
}
