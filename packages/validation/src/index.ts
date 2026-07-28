import { z } from 'zod';

export const aiRecommendationSchema = z.object({
  summary: z.string().min(1).max(500),
  balanceReason: z.string().max(500),
  dishes: z.array(z.object({
    name: z.string().min(1).max(80),
    reason: z.string().max(300),
    estimatedMinutes: z.number().int().nonnegative().nullable(),
    estimatedCaloriesPerServing: z.number().nonnegative().nullable(),
    missingIngredients: z.array(z.string().max(80)),
  })).min(1).max(8),
  warnings: z.array(z.string().max(300)),
});
export type AIRecommendation = z.infer<typeof aiRecommendationSchema>;
