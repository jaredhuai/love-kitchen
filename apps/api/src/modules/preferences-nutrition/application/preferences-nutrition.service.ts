import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { MealPreferenceSessionState, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma.service';
import { compatibilityScore, type MealPreference } from '../../../domain/compatibility';
import { calculateNutrition } from '../../../domain/nutrition';
import { enqueueAudit } from '../../../infra/outbox/enqueue-audit';

import { isMealType, NutritionDto, PreferenceDto, PreferenceQuery } from '../presentation/preferences-nutrition.dto';
import { preferenceLocked, preferenceNotReady, preferenceStateConflict } from '../domain/preference.errors';

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class PreferencesNutritionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async submit(kitchenId: string, userId: string, query: PreferenceQuery, dto: PreferenceDto) {
    const mealDate = this.preferenceDate(query);
    const payload = dto as unknown as Prisma.InputJsonValue;

    return this.serializable(async (tx) => {
      await this.requireActiveMember(tx, kitchenId, userId);
      const session = await tx.mealPreferenceSession.upsert({
        where: { kitchenId_mealDate_mealType: { kitchenId, mealDate, mealType: query.mealType } },
        create: { kitchenId, mealDate, mealType: query.mealType },
        update: {},
      });
      if (session.state !== MealPreferenceSessionState.OPEN) {
        throw preferenceLocked(session.state === MealPreferenceSessionState.REVEALED || session.state === MealPreferenceSessionState.CLOSED);
      }

      const submission = await tx.mealPreferenceSubmission.upsert({
        where: { sessionId_userId: { sessionId: session.id, userId } },
        create: { kitchenId, sessionId: session.id, userId, preferencePayload: payload },
        update: { preferencePayload: payload, submittedAt: new Date(), hiddenBeforeReveal: true, revealedAt: null },
      });
      const members = await tx.kitchenMember.findMany({
        where: { kitchenId, status: 'ACTIVE' },
        select: { userId: true },
      });
      const memberIds = members.map(({ userId: id }) => id);
      const submissionCount = await tx.mealPreferenceSubmission.count({
        where: { sessionId: session.id, userId: { in: memberIds } },
      });
      let state: MealPreferenceSessionState = session.state;
      if (members.length === 2 && submissionCount === 2) {
        const transitioned = await tx.mealPreferenceSession.updateMany({
          where: { id: session.id, state: MealPreferenceSessionState.OPEN, version: session.version },
          data: { state: MealPreferenceSessionState.READY_TO_REVEAL, version: { increment: 1 } },
        });
        if (transitioned.count !== 1) throw new RetryableTransitionError();
        state = MealPreferenceSessionState.READY_TO_REVEAL;
      }
      await enqueueAudit(tx, { kitchenId, userId, aggregateType: 'MealPreferenceSession', aggregateId: session.id, eventType: 'PREFERENCE_SUBMITTED', resourceId: session.id });
      return { ...submission, sessionState: state };
    });
  }

  async reveal(kitchenId: string, userId: string, query: PreferenceQuery) {
    const mealDate = this.preferenceDate(query);
    return this.serializable(async (tx) => {
      await this.requireActiveMember(tx, kitchenId, userId);
      const session = await tx.mealPreferenceSession.findUnique({
        where: { kitchenId_mealDate_mealType: { kitchenId, mealDate, mealType: query.mealType } },
        include: { submissions: true },
      });
      if (!session) return null;
      if (session.state === MealPreferenceSessionState.REVEALED || session.state === MealPreferenceSessionState.CLOSED) {
        return { score: session.compatibilityScore, submissions: session.submissions, sessionState: session.state };
      }
      if (session.state !== MealPreferenceSessionState.READY_TO_REVEAL) {
        throw preferenceNotReady();
      }

      const members = await tx.kitchenMember.findMany({
        where: { kitchenId, status: 'ACTIVE' },
        select: { userId: true },
      });
      const memberIds = members.map(({ userId: id }) => id);
      if (members.length !== 2 || session.submissions.length !== 2 || session.submissions.some((item) => !memberIds.includes(item.userId))) {
        throw new ConflictException('偏好场次与当前成员状态不一致');
      }
      const score = compatibilityScore(
        session.submissions[0]!.preferencePayload as unknown as MealPreference,
        session.submissions[1]!.preferencePayload as unknown as MealPreference,
      );
      const revealedAt = new Date();
      const transitioned = await tx.mealPreferenceSession.updateMany({
        where: { id: session.id, state: MealPreferenceSessionState.READY_TO_REVEAL, version: session.version },
        data: {
          state: MealPreferenceSessionState.REVEALED,
          version: { increment: 1 },
          compatibilityScore: score,
          revealedAt,
        },
      });
      if (transitioned.count !== 1) throw new RetryableTransitionError();
      await tx.mealPreferenceSubmission.updateMany({
        where: { sessionId: session.id, kitchenId, userId: { in: memberIds } },
        data: { hiddenBeforeReveal: false, revealedAt },
      });
      await enqueueAudit(tx, { kitchenId, userId, aggregateType: 'MealPreferenceSession', aggregateId: session.id, eventType: 'PREFERENCE_REVEALED', resourceId: session.id });
      return {
        score,
        submissions: session.submissions.map((item) => ({ ...item, hiddenBeforeReveal: false, revealedAt })),
        sessionState: MealPreferenceSessionState.REVEALED,
      };
    });
  }

  async close(kitchenId: string, userId: string, query: PreferenceQuery) {
    const mealDate = this.preferenceDate(query);
    return this.serializable(async (tx) => {
      await this.requireActiveMember(tx, kitchenId, userId);
      const session = await tx.mealPreferenceSession.findUnique({
        where: { kitchenId_mealDate_mealType: { kitchenId, mealDate, mealType: query.mealType } },
      });
      if (!session) return null;
      if (session.state === MealPreferenceSessionState.CLOSED) return session;
      if (session.state !== MealPreferenceSessionState.REVEALED) {
        throw new BadRequestException('只有已揭晓的偏好场次可以关闭');
      }
      const closedAt = new Date();
      const transitioned = await tx.mealPreferenceSession.updateMany({
        where: { id: session.id, state: MealPreferenceSessionState.REVEALED, version: session.version },
        data: { state: MealPreferenceSessionState.CLOSED, version: { increment: 1 }, closedAt },
      });
      if (transitioned.count !== 1) throw new RetryableTransitionError();
      await enqueueAudit(tx, { kitchenId, userId, aggregateType: 'MealPreferenceSession', aggregateId: session.id, eventType: 'PREFERENCE_CLOSED', resourceId: session.id });
      return { ...session, state: MealPreferenceSessionState.CLOSED, version: session.version + 1, closedAt };
    });
  }

  async get(kitchenId: string, userId: string, query: PreferenceQuery) {
    const mealDate = this.preferenceDate(query);
    const session = await this.prisma.mealPreferenceSession.findUnique({
      where: { kitchenId_mealDate_mealType: { kitchenId, mealDate, mealType: query.mealType } },
      include: { submissions: true },
    });
    if (!session) return null;
    const visible = session.state === MealPreferenceSessionState.REVEALED || session.state === MealPreferenceSessionState.CLOSED;
    return {
      ...session,
      submissions: visible
        ? session.submissions
        : session.submissions.map((item) => (item.userId === userId ? item : { ...item, preferencePayload: null })),
    };
  }

  calculate(dto: NutritionDto) {
    return calculateNutrition(dto.items, dto.servings);
  }

  private mealDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(value)) throw new BadRequestException('日期格式无效');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('日期格式无效');
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }

  private preferenceDate(query: PreferenceQuery) {
    if (!isMealType(query.mealType)) throw new BadRequestException('餐次类型无效');
    return this.mealDate(query.date);
  }

  private async requireActiveMember(tx: TransactionClient, kitchenId: string, userId: string) {
    const member = await tx.kitchenMember.findUnique({ where: { kitchenId_userId: { kitchenId, userId } } });
    if (!member || member.status !== 'ACTIVE') throw new BadRequestException('当前用户不是有效厨房成员');
  }

  private async serializable<T>(work: (tx: TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        const retryable =
          error instanceof RetryableTransitionError ||
          (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code));
        if (!retryable) throw error;
        if (attempt === 5) throw preferenceStateConflict();
      }
    }
    throw preferenceStateConflict();
  }
}

class RetryableTransitionError extends Error {}
