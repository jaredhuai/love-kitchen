import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureHttpApp } from '../src/common/configure-http-app';

const KITCHEN_A = '10000000-0000-4000-8000-000000000001';
const KITCHEN_B = '20000000-0000-4000-8000-000000000002';
const USER_A = '10000000-0000-4000-8000-000000000011';
const USER_B = '10000000-0000-4000-8000-000000000012';
const USER_C = '20000000-0000-4000-8000-000000000021';
const USER_D = '20000000-0000-4000-8000-000000000022';
const DISH_A = '10000000-0000-4000-8000-000000000101';
const DISH_B = '20000000-0000-4000-8000-000000000202';
const GROUP_A = '10000000-0000-4000-8000-000000000301';
const GROUP_B = '20000000-0000-4000-8000-000000000302';
const PLAN_A = '10000000-0000-4000-8000-000000000401';
const PLAN_B = '20000000-0000-4000-8000-000000000402';

describe('Meal plan cross-kitchen IDOR (real AppModule)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessTokenA: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('love_kitchen_test')) {
      throw new Error('IDOR E2E requires the dedicated love_kitchen_test database');
    }

    prisma = new PrismaClient();
    await prisma.$connect();
    await resetTestData(prisma);
    await seedTwoKitchens(prisma);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureHttpApp(app);
    await app.init();

    accessTokenA = await app.get(JwtService).signAsync(
      { sub: USER_A },
      { secret: app.get(ConfigService).getOrThrow('JWT_ACCESS_SECRET'), expiresIn: '5m' },
    );
  });

  afterAll(async () => {
    if (prisma) await resetTestData(prisma);
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
  });

  it('rejects creating a kitchen A plan with a kitchen B dish', async () => {
    await postAsA(`/api/v1/kitchens/${KITCHEN_A}/meal-plans`)
      .send({
        mealDate: '2026-07-14',
        mealType: 'DINNER',
        servings: 2,
        dishId: DISH_B,
      })
      .expect(404);

    expect(await prisma.mealPlan.count({ where: { kitchenId: KITCHEN_A } })).toBe(1);
  });

  it('rejects updating a kitchen A plan to a kitchen B dish or cook', async () => {
    await patchAsA(`/api/v1/kitchens/${KITCHEN_A}/meal-plans/${PLAN_A}`)
      .send({ dishId: DISH_B })
      .expect(404);
    await patchAsA(`/api/v1/kitchens/${KITCHEN_A}/meal-plans/${PLAN_A}`)
      .send({ cookUserId: USER_C })
      .expect(404);

    const plan = await prisma.mealPlan.findUniqueOrThrow({ where: { id: PLAN_A } });
    expect(plan.dishId).toBe(DISH_A);
    expect(plan.cookUserId).toBe(USER_A);
  });

  it('rejects voting on a kitchen B plan through kitchen A', async () => {
    await postAsA(`/api/v1/kitchens/${KITCHEN_A}/meal-plans/${PLAN_B}/votes`)
      .send({ value: 1 })
      .expect(404);
    expect(await prisma.mealVote.count({ where: { mealPlanId: PLAN_B } })).toBe(0);
  });

  it('rejects assigning a kitchen B user to kitchen A duties', async () => {
    await postAsA(`/api/v1/kitchens/${KITCHEN_A}/cooking-assignment`)
      .send({
        assignmentDate: '2026-07-14',
        mode: 'MANUAL',
        chefUserId: USER_C,
      })
      .expect(404);
    expect(await prisma.cookingAssignment.count({ where: { kitchenId: KITCHEN_A } })).toBe(0);
  });

  it('rejects kitchen B dish and meal plan references in kitchen A history', async () => {
    await postAsA(`/api/v1/kitchens/${KITCHEN_A}/meal-history`)
      .send({
        eatenAt: '2026-07-14T10:00:00.000Z',
        mealType: 'DINNER',
        servings: 2,
        dishId: DISH_B,
      })
      .expect(404);
    await postAsA(`/api/v1/kitchens/${KITCHEN_A}/meal-history`)
      .send({
        eatenAt: '2026-07-14T10:00:00.000Z',
        mealType: 'DINNER',
        servings: 2,
        mealPlanId: PLAN_B,
      })
      .expect(404);
    expect(await prisma.mealLog.count({ where: { kitchenId: KITCHEN_A } })).toBe(0);
  });

  it('still permits valid kitchen A associations', async () => {
    await postAsA(`/api/v1/kitchens/${KITCHEN_A}/meal-history`)
      .send({
        eatenAt: '2026-07-14T10:00:00.000Z',
        mealType: 'DINNER',
        servings: 2,
        mealPlanId: PLAN_A,
        dishId: DISH_A,
        eaterUserIds: [USER_A, USER_B],
        cookedBy: USER_A,
      })
      .expect(201);
    expect(await prisma.mealLog.count({ where: { kitchenId: KITCHEN_A } })).toBe(1);
  });

  function postAsA(path: string) {
    return request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${accessTokenA}`);
  }

  function patchAsA(path: string) {
    return request(app.getHttpServer()).patch(path).set('Authorization', `Bearer ${accessTokenA}`);
  }
});

async function resetTestData(prisma: PrismaClient) {
  const kitchenIds = [KITCHEN_A, KITCHEN_B];
  const userIds = [USER_A, USER_B, USER_C, USER_D];
  const dishIds = [DISH_A, DISH_B];
  const planIds = [PLAN_A, PLAN_B];
  await prisma.auditLog.deleteMany({ where: { OR: [{ kitchenId: { in: kitchenIds } }, { userId: { in: userIds } }] } });
  await prisma.outboxEvent.deleteMany({ where: { kitchenId: { in: kitchenIds } } });
  await prisma.mealVote.deleteMany({ where: { mealPlanId: { in: planIds } } });
  await prisma.cookingAssignment.deleteMany({ where: { kitchenId: { in: kitchenIds } } });
  await prisma.mealLog.deleteMany({ where: { kitchenId: { in: kitchenIds } } });
  await prisma.mealPlan.deleteMany({ where: { kitchenId: { in: kitchenIds } } });
  await prisma.mealPlanGroup.deleteMany({ where: { kitchenId: { in: kitchenIds } } });
  await prisma.dishReview.deleteMany({ where: { dishId: { in: dishIds } } });
  await prisma.recipeStep.deleteMany({ where: { dishId: { in: dishIds } } });
  await prisma.dishIngredient.deleteMany({ where: { dishId: { in: dishIds } } });
  await prisma.dish.deleteMany({ where: { id: { in: dishIds } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.kitchenMember.deleteMany({ where: { kitchenId: { in: kitchenIds } } });
  await prisma.kitchen.deleteMany({ where: { id: { in: kitchenIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function seedTwoKitchens(prisma: PrismaClient) {
  await prisma.user.createMany({
    data: [
      { id: USER_A, devKey: 'phase1-user-a', nickname: 'A' },
      { id: USER_B, devKey: 'phase1-user-b', nickname: 'B' },
      { id: USER_C, devKey: 'phase1-user-c', nickname: 'C' },
      { id: USER_D, devKey: 'phase1-user-d', nickname: 'D' },
    ],
  });
  await prisma.kitchen.createMany({
    data: [
      { id: KITCHEN_A, name: 'A厨房', createdBy: USER_A },
      { id: KITCHEN_B, name: 'B厨房', createdBy: USER_C },
    ],
  });
  await prisma.kitchenMember.createMany({
    data: [
      { kitchenId: KITCHEN_A, userId: USER_A, role: 'OWNER' },
      { kitchenId: KITCHEN_A, userId: USER_B, role: 'MEMBER' },
      { kitchenId: KITCHEN_B, userId: USER_C, role: 'OWNER' },
      { kitchenId: KITCHEN_B, userId: USER_D, role: 'MEMBER' },
    ],
  });
  await prisma.dish.createMany({
    data: [
      { id: DISH_A, kitchenId: KITCHEN_A, name: 'A菜', createdBy: USER_A, tags: [] },
      { id: DISH_B, kitchenId: KITCHEN_B, name: 'B菜', createdBy: USER_C, tags: [] },
    ],
  });
  await prisma.mealPlanGroup.createMany({
    data: [
      { id: GROUP_A, kitchenId: KITCHEN_A, weekStart: new Date('2026-07-14'), createdBy: USER_A },
      { id: GROUP_B, kitchenId: KITCHEN_B, weekStart: new Date('2026-07-14'), createdBy: USER_C },
    ],
  });
  await prisma.mealPlan.createMany({
    data: [
      { id: PLAN_A, kitchenId: KITCHEN_A, groupId: GROUP_A, dishId: DISH_A, mealDate: new Date('2026-07-14'), mealType: 'DINNER', servings: 2, cookUserId: USER_A, createdBy: USER_A },
      { id: PLAN_B, kitchenId: KITCHEN_B, groupId: GROUP_B, dishId: DISH_B, mealDate: new Date('2026-07-14'), mealType: 'DINNER', servings: 2, cookUserId: USER_C, createdBy: USER_C },
    ],
  });
}
