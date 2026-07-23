import { PrismaClient, KitchenRole } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await Promise.all(['user-a','user-b','user-c','user-d'].map((devKey) => prisma.user.upsert({ where:{devKey}, update:{}, create:{devKey,nickname:devKey} })));
  for (const [name, pair] of [['华华和德德的小厨房',[users[0],users[1]]],['另一个私密厨房',[users[2],users[3]]]] as const) {
    const owner = pair[0]!; const member = pair[1]!;
    const kitchen = await prisma.kitchen.upsert({ where:{id: owner.id}, update:{}, create:{id:owner.id,name,createdBy:owner.id} });
    await prisma.kitchenMember.upsert({where:{kitchenId_userId:{kitchenId:kitchen.id,userId:owner.id}},update:{},create:{kitchenId:kitchen.id,userId:owner.id,role:KitchenRole.OWNER}});
    await prisma.kitchenMember.upsert({where:{kitchenId_userId:{kitchenId:kitchen.id,userId:member.id}},update:{},create:{kitchenId:kitchen.id,userId:member.id,role:KitchenRole.MEMBER}});
  }
}
main().finally(() => prisma.$disconnect());
