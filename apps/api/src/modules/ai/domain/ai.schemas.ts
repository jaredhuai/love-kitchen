import { z } from 'zod';

export const RecommendationSchema = z.object({
  recommendations: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        reason: z.string().min(1).max(500),
        ingredients: z.array(z.string().min(1).max(100)).max(30),
      }),
    )
    .min(1)
    .max(10),
});
