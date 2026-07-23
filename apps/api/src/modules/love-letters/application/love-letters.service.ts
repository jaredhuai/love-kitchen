import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../infra/prisma.service';
import { decryptLetter, encryptLetter } from '../../../domain/letter-crypto';
import { enqueueAudit } from '../../../infra/outbox/enqueue-audit';
import type { CreateLetterDto } from '../presentation/love-letter.dto';
import { invalidLetterCondition, invalidLetterRecipient, loveLetterNotFound } from '../domain/love-letter.errors';

const publicSelection = {
  id: true, title: true, createdBy: true, recipientUserId: true, unlockType: true,
  unlockAt: true, unlockDishCount: true, unlockMealCount: true, status: true,
  openedAt: true, createdAt: true,
} as const;

@Injectable()
export class LoveLettersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(ConfigService) private readonly config: ConfigService) {}

  list(kitchenId: string, userId: string) {
    return this.prisma.loveLetter.findMany({
      where: { kitchenId, deletedAt: null, OR: [{ createdBy: userId }, { recipientUserId: userId }] },
      select: publicSelection,
    });
  }

  async create(kitchenId: string, userId: string, dto: CreateLetterDto) {
    this.validateCondition(dto);
    const keyVersion = this.config.get<number>('LOVE_LETTER_KEY_VERSION') ?? 1;
    const encryptedContent = encryptLetter(dto.content, this.keyFor(keyVersion));
    return this.prisma.$transaction(async (tx) => {
      const members = await tx.kitchenMember.findMany({ where: { kitchenId, status: 'ACTIVE' }, select: { userId: true } });
      if (members.length !== 2 || dto.recipientUserId === userId || !members.some((member) => member.userId === dto.recipientUserId)) {
        throw invalidLetterRecipient();
      }
      const letter = await tx.loveLetter.create({
        data: {
          kitchenId, createdBy: userId, recipientUserId: dto.recipientUserId, title: dto.title,
          encryptedContent, keyVersion, unlockType: dto.unlockType,
          unlockAt: dto.unlockAt ? new Date(dto.unlockAt) : null,
          unlockDishCount: dto.unlockDishCount ?? null, unlockMealCount: dto.unlockMealCount ?? null,
        },
        select: publicSelection,
      });
      await enqueueAudit(tx, { kitchenId, userId, aggregateType: 'LoveLetter', aggregateId: letter.id, eventType: 'LOVE_LETTER_CREATED', resourceId: letter.id });
      return letter;
    });
  }

  async open(kitchenId: string, id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const letter = await tx.loveLetter.findFirst({ where: { id, kitchenId, deletedAt: null, recipientUserId: userId } });
      if (!letter) throw loveLetterNotFound();
      const [dishCount, mealCount] = await Promise.all([
        tx.dish.count({ where: { kitchenId, deletedAt: null, status: 'ACTIVE' } }),
        tx.mealLog.count({ where: { kitchenId } }),
      ]);
      if (!this.isUnlocked(letter, dishCount, mealCount)) return { id: letter.id, title: letter.title, locked: true };
      const content = decryptLetter(letter.encryptedContent, this.keyFor(letter.keyVersion));
      if (letter.status !== 'OPENED') {
        const updated = await tx.loveLetter.updateMany({ where: { id, kitchenId, recipientUserId: userId, deletedAt: null }, data: { status: 'OPENED', openedAt: new Date() } });
        if (updated.count !== 1) throw loveLetterNotFound();
        await enqueueAudit(tx, { kitchenId, userId, aggregateType: 'LoveLetter', aggregateId: id, eventType: 'LOVE_LETTER_OPENED', resourceId: id });
      }
      return { id: letter.id, title: letter.title, locked: false, content };
    });
  }

  async unlockManual(kitchenId: string, id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.loveLetter.updateMany({ where: { id, kitchenId, createdBy: userId, deletedAt: null, unlockType: 'MANUAL', status: 'LOCKED' }, data: { status: 'UNLOCKED' } });
      if (result.count !== 1) throw loveLetterNotFound();
      await enqueueAudit(tx, { kitchenId, userId, aggregateType: 'LoveLetter', aggregateId: id, eventType: 'LOVE_LETTER_UNLOCKED', resourceId: id });
      return { unlocked: true };
    });
  }

  private validateCondition(dto: CreateLetterDto) {
    if (dto.unlockType === 'DATE' && !dto.unlockAt) throw invalidLetterCondition('DATE 情书必须设置 unlockAt');
    if (dto.unlockType === 'DISH_COUNT' && !dto.unlockDishCount) throw invalidLetterCondition('DISH_COUNT 情书必须设置 unlockDishCount');
    if (dto.unlockType === 'MEAL_COUNT' && !dto.unlockMealCount) throw invalidLetterCondition('MEAL_COUNT 情书必须设置 unlockMealCount');
  }

  private keyFor(version: number) {
    if (version === 1) return this.config.getOrThrow<string>('LOVE_LETTER_ENCRYPTION_KEY');
    return this.config.getOrThrow<string>(`LOVE_LETTER_ENCRYPTION_KEY_V${version}`);
  }

  private isUnlocked(letter: { unlockType: string; unlockAt: Date | null; unlockDishCount: number | null; unlockMealCount: number | null; status: string }, dishCount: number, mealCount: number) {
    return letter.unlockType === 'MANUAL' ? ['UNLOCKED', 'OPENED'].includes(letter.status)
      : letter.unlockType === 'DATE' ? !!letter.unlockAt && letter.unlockAt <= new Date()
      : letter.unlockType === 'DISH_COUNT' ? dishCount >= (letter.unlockDishCount ?? Number.MAX_SAFE_INTEGER)
      : letter.unlockType === 'MEAL_COUNT' && mealCount >= (letter.unlockMealCount ?? Number.MAX_SAFE_INTEGER);
  }
}
