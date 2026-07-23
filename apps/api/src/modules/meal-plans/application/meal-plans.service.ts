import { Inject, Injectable } from '@nestjs/common';
import { enqueueAudit } from '../../../infra/outbox/enqueue-audit';
import { PrismaService } from '../../../infra/prisma.service';
import { KitchenResourcePolicy } from '../../../security/kitchen-resource.policy';
import type { AssignmentDto, MealDto, PlanDto, UpdateMealDto, VoteDto } from '../presentation/meal-plans.dto';
import { mealPlanNotFound } from '../domain/meal-plan.errors';

@Injectable()
export class MealPlansService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(KitchenResourcePolicy) private readonly resources: KitchenResourcePolicy) {}

  list(kitchenId: string, from?: string) {
    return this.prisma.mealPlan.findMany({ where: { kitchenId, ...(from ? { mealDate: { gte: new Date(from) } } : {}) }, include: { votes: true }, orderBy: { mealDate: 'asc' } });
  }

  createGroup(kitchenId: string, userId: string, dto: PlanDto) {
    return this.prisma.mealPlanGroup.upsert({ where: { kitchenId_weekStart: { kitchenId, weekStart: new Date(dto.weekStart) } }, create: { kitchenId, weekStart: new Date(dto.weekStart), title: dto.title ?? null, createdBy: userId }, update: { title: dto.title ?? null } });
  }

  add(kitchenId: string, userId: string, dto: MealDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.dishId) await this.resources.requireDish(tx, kitchenId, dto.dishId);
      await this.resources.requireActiveMembers(tx, kitchenId, [dto.cookUserId]);
      const weekStart = new Date(dto.mealDate); weekStart.setHours(0, 0, 0, 0);
      const group = await tx.mealPlanGroup.upsert({ where: { kitchenId_weekStart: { kitchenId, weekStart } }, create: { kitchenId, weekStart, createdBy: userId, title: '我的菜单' }, update: {} });
      const mealPlan = await tx.mealPlan.create({ data: { kitchenId, groupId: group.id, createdBy: userId, mealDate: new Date(dto.mealDate), mealType: dto.mealType, dishId: dto.dishId ?? null, servings: dto.servings, cookUserId: dto.cookUserId ?? null } });
      await enqueueAudit(tx, { kitchenId, userId, aggregateType: 'MealPlan', aggregateId: mealPlan.id, eventType: 'MEAL_PLAN_CREATED', resourceId: mealPlan.id });
      return mealPlan;
    });
  }

  vote(kitchenId: string, mealPlanId: string, userId: string, dto: VoteDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.resources.requireMealPlan(tx, kitchenId, mealPlanId);
      const vote = await tx.mealVote.upsert({ where: { mealPlanId_userId: { mealPlanId, userId } }, create: { kitchenId, mealPlanId, userId, value: dto.value }, update: { value: dto.value } });
      await enqueueAudit(tx, { kitchenId, userId, aggregateType: 'MealVote', aggregateId: vote.id, eventType: 'MEAL_VOTE_RECORDED', resourceId: vote.id });
      return vote;
    });
  }

  update(kitchenId: string, id: string, dto: UpdateMealDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.resources.requireMealPlan(tx, kitchenId, id);
      if (dto.dishId) await this.resources.requireDish(tx, kitchenId, dto.dishId);
      await this.resources.requireActiveMembers(tx, kitchenId, [dto.cookUserId]);
      const result = await tx.mealPlan.updateMany({ where: { id, kitchenId }, data: { ...(dto.mealDate ? { mealDate: new Date(dto.mealDate) } : {}), ...(dto.mealType ? { mealType: dto.mealType } : {}), ...(dto.dishId !== undefined ? { dishId: dto.dishId || null } : {}), ...(dto.servings !== undefined ? { servings: dto.servings } : {}), ...(dto.cookUserId !== undefined ? { cookUserId: dto.cookUserId || null } : {}) } });
      if (result.count !== 1) throw mealPlanNotFound();
      return tx.mealPlan.findFirstOrThrow({ where: { id, kitchenId } });
    });
  }

  async remove(kitchenId: string, id: string) {
    const result = await this.prisma.mealPlan.deleteMany({ where: { id, kitchenId } });
    if (result.count !== 1) throw mealPlanNotFound();
    return { deleted: true };
  }

  assignment(kitchenId: string, userId: string, dto: AssignmentDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.resources.requireActiveMembers(tx, kitchenId, [dto.chefUserId, dto.assistantUserId, dto.dishwasherUserId, dto.shopperUserId]);
      const assignment = await tx.cookingAssignment.upsert({ where: { kitchenId_assignmentDate: { kitchenId, assignmentDate: new Date(dto.assignmentDate) } }, create: { kitchenId, createdBy: userId, assignmentDate: new Date(dto.assignmentDate), mode: dto.mode, chefUserId: dto.chefUserId ?? null, assistantUserId: dto.assistantUserId ?? null, dishwasherUserId: dto.dishwasherUserId ?? null, shopperUserId: dto.shopperUserId ?? null }, update: { mode: dto.mode, chefUserId: dto.chefUserId ?? null, assistantUserId: dto.assistantUserId ?? null, dishwasherUserId: dto.dishwasherUserId ?? null, shopperUserId: dto.shopperUserId ?? null } });
      await enqueueAudit(tx, { kitchenId, userId, aggregateType: 'CookingAssignment', aggregateId: assignment.id, eventType: 'COOKING_ASSIGNMENT_SAVED', resourceId: assignment.id });
      return assignment;
    });
  }
}
