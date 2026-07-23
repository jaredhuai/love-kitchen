import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';
import { storyNotFound } from '../domain/memory.errors';
import type { AnniversaryDto, StoryDto } from '../presentation/memories.dto';
@Injectable() export class MemoriesService {
 constructor(private readonly prisma: PrismaService) {}
 stories(kitchenId: string) { return this.prisma.kitchenStory.findMany({ where: { kitchenId, deletedAt: null }, orderBy: [{ isPinned: 'desc' }, { storyDate: 'desc' }] }); }
 createStory(kitchenId: string, userId: string, dto: StoryDto) { return this.prisma.kitchenStory.create({ data: { kitchenId, createdBy: userId, title: dto.title, content: dto.content, storyDate: new Date(dto.storyDate), storyType: dto.storyType ?? 'CUSTOM', isPinned: dto.isPinned ?? false, imageUrls: [] } }); }
 async deleteStory(kitchenId: string, id: string) { const result = await this.prisma.kitchenStory.updateMany({ where: { id, kitchenId, deletedAt: null }, data: { deletedAt: new Date() } }); if (result.count !== 1) throw storyNotFound(); return { deleted: true }; }
 anniversaries(kitchenId: string) { return this.prisma.anniversary.findMany({ where: { kitchenId }, orderBy: { date: 'asc' } }); }
 createAnniversary(kitchenId: string, userId: string, dto: AnniversaryDto) { return this.prisma.anniversary.create({ data: { kitchenId, createdBy: userId, name: dto.name, type: dto.type, date: new Date(dto.date), repeatsYearly: dto.repeatsYearly ?? true, notes: dto.notes ?? null } }); }
}
