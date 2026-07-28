import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';
import { storyNotFound } from '../domain/memory.errors';
import type { AnniversaryDto, StoryCommentDto, StoryDto } from '../presentation/memories.dto';
@Injectable() export class MemoriesService {
 constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
 async stories(kitchenId: string) {
  const stories = await this.prisma.kitchenStory.findMany({
   where: { kitchenId, deletedAt: null },
   include: { comments: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
   orderBy: [{ isPinned: 'desc' }, { storyDate: 'desc' }],
  });
  const userIds = [...new Set(stories.flatMap((story) => [story.createdBy, ...story.comments.map((comment) => comment.userId)]))];
  const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nickname: true } });
  const names = new Map(users.map((user) => [user.id, user.nickname]));
  return stories.map((story) => ({
   ...story,
   createdByName: names.get(story.createdBy) ?? '厨房成员',
   comments: story.comments.map((comment) => ({ ...comment, authorName: names.get(comment.userId) ?? '厨房成员' })),
  }));
 }
 createStory(kitchenId: string, userId: string, dto: StoryDto) { return this.prisma.kitchenStory.create({ data: { kitchenId, createdBy: userId, title: dto.title, content: dto.content, storyDate: new Date(dto.storyDate), storyType: dto.storyType ?? 'CUSTOM', isPinned: dto.isPinned ?? false, imageUrls: [] } }); }
 async createComment(kitchenId: string, storyId: string, userId: string, dto: StoryCommentDto) {
  const story = await this.prisma.kitchenStory.findFirst({ where: { id: storyId, kitchenId, deletedAt: null }, select: { id: true } });
  if (!story) throw storyNotFound();
  const [comment, user] = await Promise.all([
   this.prisma.storyComment.create({ data: { kitchenId, storyId, userId, content: dto.content.trim() } }),
   this.prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } }),
  ]);
  return { ...comment, authorName: user?.nickname ?? '厨房成员' };
 }
 async deleteStory(kitchenId: string, id: string) { const result = await this.prisma.kitchenStory.updateMany({ where: { id, kitchenId, deletedAt: null }, data: { deletedAt: new Date() } }); if (result.count !== 1) throw storyNotFound(); return { deleted: true }; }
 anniversaries(kitchenId: string) { return this.prisma.anniversary.findMany({ where: { kitchenId }, orderBy: { date: 'asc' } }); }
 createAnniversary(kitchenId: string, userId: string, dto: AnniversaryDto) { return this.prisma.anniversary.create({ data: { kitchenId, createdBy: userId, name: dto.name, type: dto.type, date: new Date(dto.date), repeatsYearly: dto.repeatsYearly ?? true, notes: dto.notes ?? null } }); }
}
