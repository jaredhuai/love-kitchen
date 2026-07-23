import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, SecurityEventSeverity, SecurityEventType } from '@prisma/client';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../../infra/prisma.service';
import {
  accountUnavailable,
  devLoginForbidden,
  invalidKitchenPassword,
  kitchenMemberLimitReached,
  invalidRefreshToken,
  refreshTokenReused,
} from '../domain/auth.errors';
import {
  WECHAT_AUTH_PROVIDER,
  type WechatAuthProvider,
  type WechatIdentityResult,
} from '../infrastructure/wechat-auth.provider';

export type AuthRequestContext = { requestId?: string; deviceId?: string; userAgent?: string };
type TokenPayload = { sub: string; jti: string; sid?: string };

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(WECHAT_AUTH_PROVIDER) private readonly wechat: WechatAuthProvider,
  ) {}

  async devLogin(userKey: string, context: AuthRequestContext = {}) {
    if (this.config.get('NODE_ENV') === 'production') throw devLoginForbidden();
    const user = await this.prisma.user.upsert({
      where: { devKey: userKey },
      update: {},
      create: { devKey: userKey, nickname: userKey },
    });
    if (user.status && user.status !== 'ACTIVE') throw accountUnavailable();
    return this.issueInitial(user.id, user.nickname, context);
  }

  async wechatLogin(code: string, context: AuthRequestContext = {}, accessPassword?: string) {
    this.assertKitchenPassword(accessPassword);
    let identity: WechatIdentityResult;
    try {
      identity = await this.wechat.exchange(code);
    } catch (error) {
      await this.recordLoginFailure(error, context.requestId);
      throw error;
    }
    const user = await this.findOrCreateWechatUser(identity);
    if (user.status && user.status !== 'ACTIVE') throw accountUnavailable();
    return this.issueInitial(user.id, user.nickname, context);
  }

  async refresh(
    raw: string,
    context: AuthRequestContext = {},
    attempt = 0,
  ): Promise<Awaited<ReturnType<AuthService['issueInitial']>>> {
    const payload = await this.verifyRefresh(raw);
    const tokenHash = this.hash(raw);
    try {
      const outcome = await this.prisma.$transaction(
        async (tx) => {
          let session = await tx.refreshTokenSession.findUnique({
            where: { id: payload.jti },
            include: { user: true },
          });
          if (!session) {
            const legacy = await tx.refreshToken.findFirst({
              where: { id: payload.jti, userId: payload.sub, tokenHash },
            });
            if (!legacy) return { kind: 'invalid' } as const;
            session = await tx.refreshTokenSession.create({
              data: {
                id: legacy.id,
                userId: legacy.userId,
                familyId: payload.sid ?? legacy.id,
                tokenHash: legacy.tokenHash,
                issuedAt: legacy.createdAt,
                expiresAt: legacy.expiresAt,
                revokedAt: legacy.revokedAt,
                revokeReason: legacy.revokedAt ? 'LEGACY_REVOKED' : null,
              },
              include: { user: true },
            });
          }
          if (
            session.userId !== payload.sub ||
            session.tokenHash !== tokenHash ||
            session.expiresAt <= new Date()
          )
            return { kind: 'invalid' } as const;
          if (session.user.status && session.user.status !== 'ACTIVE')
            return { kind: 'invalid' } as const;
          if (session.revokedAt) {
            if (session.revokeReason !== 'ROTATED') return { kind: 'invalid' } as const;
            const now = new Date();
            await tx.refreshTokenSession.updateMany({
              where: { familyId: session.familyId, revokedAt: null },
              data: { revokedAt: now, revokeReason: 'REUSE_DETECTED' },
            });
            await tx.refreshTokenSession.update({
              where: { id: session.id },
              data: { reuseDetectedAt: now },
            });
            await tx.securityEvent.create({
              data: {
                userId: session.userId,
                eventType: SecurityEventType.TOKEN_REUSED,
                severity: SecurityEventSeverity.HIGH,
                requestId: context.requestId ?? null,
                metadata: { familyId: session.familyId },
              },
            });
            return { kind: 'reused' } as const;
          }
          const nextId = randomUUID();
          const pair = await this.signPair(session.userId, nextId, session.familyId);
          const now = new Date();
          const rotated = await tx.refreshTokenSession.updateMany({
            where: { id: session.id, revokedAt: null },
            data: { revokedAt: now, revokeReason: 'ROTATED' },
          });
          if (rotated.count !== 1)
            throw new Prisma.PrismaClientKnownRequestError('Refresh session changed concurrently', {
              code: 'P2034',
              clientVersion: Prisma.prismaVersion.client,
            });
          await tx.refreshToken.updateMany({
            where: { id: session.id, revokedAt: null },
            data: { revokedAt: now },
          });
          await Promise.all([
            tx.refreshTokenSession.create({
              data: {
                id: nextId,
                userId: session.userId,
                familyId: session.familyId,
                tokenHash: this.hash(pair.refreshToken),
                deviceId: context.deviceId ?? session.deviceId,
                userAgentHash: this.userAgentHash(context.userAgent) ?? session.userAgentHash,
                expiresAt: pair.refreshExpiresAt,
                rotatedFromId: session.id,
              },
            }),
            tx.refreshToken.create({
              data: {
                id: nextId,
                userId: session.userId,
                tokenHash: this.hash(pair.refreshToken),
                expiresAt: pair.refreshExpiresAt,
              },
            }),
          ]);
          const membership = await tx.kitchenMember.findFirst({
            where: { userId: session.userId, status: 'ACTIVE' },
            select: { kitchenId: true, role: true },
          });
          return { kind: 'success', value: this.response(pair, session.user, membership) } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      if (outcome.kind === 'success') return outcome.value;
      if (outcome.kind === 'reused') throw refreshTokenReused();
      throw invalidRefreshToken();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034' &&
        attempt < 3
      )
        return this.refresh(raw, context, attempt + 1);
      throw error;
    }
  }

  async logout(userId: string, raw: string) {
    const payload = await this.verifyRefresh(raw);
    if (payload.sub !== userId) throw invalidRefreshToken();
    const tokenHash = this.hash(raw);
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.refreshTokenSession.findFirst({
        where: { id: payload.jti, userId, tokenHash },
      });
      if (!session) throw invalidRefreshToken();
      const now = new Date();
      await tx.refreshTokenSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'LOGOUT' },
      });
      await tx.refreshToken.updateMany({
        where: { id: payload.jti, userId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
    return { loggedOut: true };
  }

  async logoutAll(userId: string) {
    const now = new Date();
    const [sessions] = await this.prisma.$transaction([
      this.prisma.refreshTokenSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'LOGOUT_ALL' },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
    return { loggedOut: true, sessionsRevoked: sessions.count };
  }

  private async findOrCreateWechatUser(identity: WechatIdentityResult) {
    const existing = await this.prisma.wechatIdentity.findUnique({
      where: { appId_openId: { appId: identity.appId, openId: identity.openId } },
      include: { user: true },
    });
    if (existing) {
      await this.prisma.wechatIdentity.update({
        where: { id: existing.id },
        data: { unionId: identity.unionId ?? existing.unionId, lastLoginAt: new Date() },
      });
      return existing.user;
    }
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const legacy = await tx.user.findUnique({ where: { wechatOpenId: identity.openId } });
          const user =
            legacy ??
            (await tx.user.create({
              data: { wechatOpenId: identity.openId, nickname: '微信用户' },
            }));
          await tx.wechatIdentity.create({
            data: {
              userId: user.id,
              appId: identity.appId,
              openId: identity.openId,
              unionId: identity.unionId ?? null,
              lastLoginAt: new Date(),
            },
          });
          return user;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.wechatIdentity.findUnique({
          where: { appId_openId: { appId: identity.appId, openId: identity.openId } },
          include: { user: true },
        });
        if (raced) return raced.user;
      }
      throw error;
    }
  }

  private async issueInitial(userId: string, nickname: string, context: AuthRequestContext) {
    const id = randomUUID();
    const pair = await this.signPair(userId, id, id);
    return this.prisma.$transaction(async (tx) => {
      const tokenHash = this.hash(pair.refreshToken);
      await Promise.all([
        tx.refreshTokenSession.create({
          data: {
            id,
            userId,
            familyId: id,
            tokenHash,
            deviceId: context.deviceId ?? null,
            userAgentHash: this.userAgentHash(context.userAgent),
            expiresAt: pair.refreshExpiresAt,
          },
        }),
        tx.refreshToken.create({
          data: { id, userId, tokenHash, expiresAt: pair.refreshExpiresAt },
        }),
      ]);
      const membership = this.config.get<boolean>('SINGLE_KITCHEN_MODE')
        ? await this.ensureSingleKitchenMembership(tx, userId)
        : await tx.kitchenMember.findFirst({
            where: { userId, status: 'ACTIVE' },
            select: { kitchenId: true, role: true },
          });
      return this.response(pair, { id: userId, nickname }, membership);
    });
  }

  private assertKitchenPassword(value?: string) {
    if (!this.config.get<boolean>('SINGLE_KITCHEN_MODE')) return;
    const expected = this.config.getOrThrow<string>('KITCHEN_ACCESS_PASSWORD');
    const actualBuffer = Buffer.from(value ?? '');
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer))
      throw invalidKitchenPassword();
  }

  private async ensureSingleKitchenMembership(tx: Prisma.TransactionClient, userId: string) {
    let kitchen = await tx.kitchen.findFirst({
      where: { name: '德德与桐桐', deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (!kitchen) {
      kitchen = await tx.kitchen.create({
        data: { name: '德德与桐桐', slogan: '一日三餐，四季有你。', maxMembers: 2, defaultServings: 2, createdBy: userId },
      });
    }
    const existing = await tx.kitchenMember.findUnique({
      where: { kitchenId_userId: { kitchenId: kitchen.id, userId } },
      select: { kitchenId: true, role: true, status: true },
    });
    if (existing?.status === 'ACTIVE') return { kitchenId: existing.kitchenId, role: existing.role };
    const memberCount = await tx.kitchenMember.count({ where: { kitchenId: kitchen.id, status: 'ACTIVE' } });
    if (memberCount >= 2) throw kitchenMemberLimitReached();
    const role = memberCount === 0 ? 'OWNER' as const : 'MEMBER' as const;
    await tx.kitchenMember.upsert({
      where: { kitchenId_userId: { kitchenId: kitchen.id, userId } },
      update: { status: 'ACTIVE', role, leftAt: null },
      create: { kitchenId: kitchen.id, userId, role },
    });
    return { kitchenId: kitchen.id, role };
  }

  private async signPair(userId: string, jti: string, familyId: string) {
    const accessExpiresIn = this.config.get<string>('ACCESS_TOKEN_EXPIRES_IN') ?? '15m';
    const refreshExpiresIn = this.config.get<string>('REFRESH_TOKEN_EXPIRES_IN') ?? '30d';
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: userId },
        { secret: this.config.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: accessExpiresIn },
      ),
      this.jwt.signAsync(
        { sub: userId, jti, sid: familyId },
        { secret: this.config.getOrThrow('JWT_REFRESH_SECRET'), expiresIn: refreshExpiresIn },
      ),
    ]);
    return {
      accessToken,
      refreshToken,
      refreshExpiresAt: new Date(Date.now() + durationMs(refreshExpiresIn)),
    };
  }

  private response(
    pair: { accessToken: string; refreshToken: string },
    user: { id: string; nickname: string },
    kitchen: { kitchenId: string; role: string } | null,
  ) {
    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      user: { id: user.id, nickname: user.nickname },
      kitchen,
    };
  }

  private async verifyRefresh(raw: string): Promise<TokenPayload> {
    try {
      return await this.jwt.verifyAsync(raw, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw invalidRefreshToken();
    }
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
  private userAgentHash(value?: string) {
    return value ? this.hash(value).slice(0, 128) : null;
  }

  private async recordLoginFailure(error: unknown, requestId?: string) {
    try {
      const response =
        error && typeof error === 'object' && 'getResponse' in error
          ? (error as { getResponse(): unknown }).getResponse()
          : null;
      const code =
        response && typeof response === 'object' && 'code' in response
          ? String((response as { code: unknown }).code)
          : 'AUTH_WECHAT_UNKNOWN';
      await this.prisma.securityEvent.create({
        data: {
          eventType: SecurityEventType.LOGIN_FAILED,
          severity: SecurityEventSeverity.WARN,
          requestId: requestId ?? null,
          metadata: { reason: code },
        },
      });
    } catch {
      /* Authentication must fail closed even if telemetry storage is unavailable. */
    }
  }
}

function durationMs(value: string): number {
  const match = /^(\d+)\s*(s|m|h|d)?$/i.exec(value.trim());
  if (!match) return 30 * 864e5;
  const amount = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  return amount * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit] ?? 1000);
}
