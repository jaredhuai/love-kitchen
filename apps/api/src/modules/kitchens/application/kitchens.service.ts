import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../../infra/prisma.service';
import { activeKitchenExists, inviteGone, inviteNotFound, kitchenFull, otherKitchenExists, ownInviteForbidden } from '../domain/kitchen.errors';
import type { CreateKitchenDto } from '../presentation/kitchens.dto';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class KitchensService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateKitchenDto) {
    const active = await this.prisma.kitchenMember.count({ where: { userId, status: 'ACTIVE', kitchen: { deletedAt: null } } });
    if (active) throw activeKitchenExists();
    return this.prisma.$transaction(async (tx) => {
      const kitchen = await tx.kitchen.create({ data: { name: dto.name, slogan: dto.slogan ?? null, defaultServings: dto.defaultServings ?? 2, createdBy: userId } });
      await tx.kitchenMember.create({ data: { kitchenId: kitchen.id, userId, role: 'OWNER' } });
      await tx.timelineEvent.create({ data: { kitchenId: kitchen.id, eventType: 'KITCHEN_CREATED', eventDate: new Date(), title: '创建了属于两个人的小厨房', generatedBySystem: true, createdBy: userId } });
      return kitchen;
    });
  }

  async invite(kitchenId: string, userId: string) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 864e5);
    await this.prisma.kitchenInvite.create({ data: { kitchenId, createdBy: userId, tokenHash: hash(token), expiresAt } });
    return { token, expiresAt };
  }

  async preview(token: string) {
    const invite = await this.prisma.kitchenInvite.findUnique({ where: { tokenHash: hash(token) }, include: { kitchen: { include: { members: { where: { status: 'ACTIVE' }, include: { user: true } } } } } });
    if (!invite) throw inviteNotFound();
    const valid = invite.status === 'ACTIVE' && !invite.revokedAt && !invite.usedAt && invite.expiresAt > new Date() && !invite.kitchen.deletedAt;
    return { name: invite.kitchen.name, avatarUrl: invite.kitchen.avatarUrl, inviterNickname: invite.kitchen.members.find((member) => member.userId === invite.createdBy)?.user.nickname ?? '', isFull: invite.kitchen.members.length >= invite.kitchen.maxMembers, isValid: valid };
  }

  async accept(token: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const invite = await tx.kitchenInvite.findUnique({ where: { tokenHash: hash(token) }, include: { kitchen: true } });
      if (!invite) throw inviteNotFound();
      if (invite.revokedAt || invite.status === 'REVOKED') throw inviteGone('邀请码已撤销');
      if (invite.usedAt || invite.status === 'USED') throw inviteGone('邀请码已使用');
      if (invite.expiresAt <= new Date()) throw inviteGone('邀请码已过期');
      if (invite.kitchen.createdBy === userId) throw ownInviteForbidden();
      const own = await tx.kitchenMember.count({ where: { userId, status: 'ACTIVE', kitchen: { deletedAt: null } } });
      if (own) throw otherKitchenExists();
      const count = await tx.kitchenMember.count({ where: { kitchenId: invite.kitchenId, status: 'ACTIVE' } });
      if (count >= invite.kitchen.maxMembers) throw kitchenFull();
      await tx.kitchenMember.create({ data: { kitchenId: invite.kitchenId, userId, role: 'MEMBER' } });
      await tx.kitchenInvite.update({ where: { id: invite.id }, data: { status: 'USED', usedAt: new Date(), usedBy: userId } });
      await tx.timelineEvent.create({ data: { kitchenId: invite.kitchenId, eventType: 'MEMBER_JOINED', eventDate: new Date(), title: '两个人终于在厨房里相遇了。', generatedBySystem: true, createdBy: userId } });
      return { ...invite.kitchen, memberCount: count + 1 };
    }, { isolationLevel: 'Serializable' });
  }
}
