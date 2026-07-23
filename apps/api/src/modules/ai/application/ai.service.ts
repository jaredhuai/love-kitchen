import { Inject, Injectable } from '@nestjs/common';
import { aiConversationNotFound, invalidAiConversationCursor } from '../domain/ai.errors';
import { RecommendationSchema } from '../domain/ai.schemas';
import { AiRepository } from '../infrastructure/ai.repository';
import type { RecommendationDto } from '../presentation/ai.dto';
import { AiOrchestratorService } from './ai-orchestrator.service';

@Injectable()
export class AiService {
  constructor(
    @Inject(AiOrchestratorService) private readonly orchestrator: AiOrchestratorService,
    @Inject(AiRepository) private readonly repository: AiRepository,
  ) {}

  async recommend(kitchenId: string, userId: string, dto: RecommendationDto, requestKey: string) {
    const dishes = await this.repository.listDishes(kitchenId);
    const request = {
      temperature: 0.4,
      messages: [
        {
          role: 'system' as const,
          content:
            '你是私密双人厨房助手。只根据本次提供的数据输出 JSON，不能编造个人事实。输出格式：{"recommendations":[{"name":"string","reason":"string","ingredients":["string"]}]}',
        },
        {
          role: 'user' as const,
          content: JSON.stringify({
            request: dto.request ?? '',
            servings: dto.servings ?? 2,
            dishes,
          }),
        },
      ],
    };
    return this.orchestrator.execute({
      kitchenId,
      userId,
      requestKey,
      request,
      schema: RecommendationSchema,
      fallback: () => ({
        recommendations: dishes.length
          ? dishes
              .slice(0, 3)
              .map((dish) => ({
                name: dish.name,
                reason: 'AI 暂不可用，按现有菜品提供',
                ingredients: [],
              }))
          : [
              {
                name: '家常搭配',
                reason: 'AI 暂不可用，请稍后重试或从现有食材选择',
                ingredients: [],
              },
            ],
      }),
      persist: async (result) => {
        await this.repository.persistRecommendation(kitchenId, userId, result);
      },
    });
  }

  listConversations(kitchenId: string, userId: string) {
    return this.repository.listLegacy(kitchenId, userId);
  }

  metrics(kitchenId: string, userId: string) {
    return this.orchestrator.metrics(kitchenId, userId);
  }

  async listConversationsV2(kitchenId: string, userId: string, limit = 20, rawCursor?: string) {
    const pageSize = Math.min(Math.max(Number(limit), 1), 50);
    const cursor = rawCursor ? this.decodeCursor(rawCursor) : undefined;
    const rows = await this.repository.listCursor(kitchenId, userId, pageSize, cursor);
    const hasNextPage = rows.length > pageSize;
    const items = rows.slice(0, pageSize);
    const last = items.at(-1);
    return {
      items,
      pageInfo: {
        nextCursor: hasNextPage && last ? this.encodeCursor(last.createdAt, last.id) : null,
        hasNextPage,
      },
    };
  }

  async getConversation(kitchenId: string, userId: string, id: string) {
    const conversation = await this.repository.getConversation(kitchenId, userId, id);
    if (!conversation) throw aiConversationNotFound();
    return conversation;
  }

  private encodeCursor(createdAt: Date, id: string) {
    return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString(
      'base64url',
    );
  }
  private decodeCursor(value: string) {
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
        createdAt?: string;
        id?: string;
      };
      const createdAt = new Date(parsed.createdAt ?? '');
      if (Number.isNaN(createdAt.getTime()) || !parsed.id?.match(/^[0-9a-f-]{36}$/i))
        throw new Error();
      return { createdAt, id: parsed.id };
    } catch {
      throw invalidAiConversationCursor();
    }
  }
}
