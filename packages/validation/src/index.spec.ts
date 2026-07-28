import {describe,expect,it} from 'vitest';
import {aiRecommendationSchema} from './index';
describe('AI schema',()=>{it('拒绝 Markdown/非结构化结果',()=>expect(aiRecommendationSchema.safeParse('推荐番茄炒蛋').success).toBe(false));it('接受受限结构',()=>expect(aiRecommendationSchema.safeParse({summary:'今晚吃清淡一点',balanceReason:'兼顾双方',dishes:[{name:'番茄炒蛋',reason:'现有食材充足',estimatedMinutes:15,estimatedCaloriesPerServing:280,missingIngredients:[]}],warnings:[]}).success).toBe(true));});
