import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';

@Injectable()
export class AchievementsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(kitchenId: string) {
    const definitions = await this.prisma.achievementDefinition.findMany({ orderBy: { createdAt: 'asc' } });
    const unlocked = await this.prisma.kitchenAchievement.findMany({ where: { kitchenId }, include: { definition: true } });
    return definitions.map((definition) => ({ definition, unlocked: unlocked.find((item) => item.definitionId === definition.id) ?? null }));
  }
  async evaluate(kitchenId: string) {
    const count = await this.prisma.dish.count({ where: { kitchenId, deletedAt: null, status: 'ACTIVE' } });
    const definition = await this.prisma.achievementDefinition.findFirst({ where: { code: 'DISH_10' } });
    if (definition && count >= 10) {
      await this.prisma.kitchenAchievement.upsert({ where: { kitchenId_definitionId: { kitchenId, definitionId: definition.id } }, create: { kitchenId, definitionId: definition.id, progress: count, unlockedAt: new Date() }, update: { progress: count } });
    }
    return this.list(kitchenId);
  }
}
