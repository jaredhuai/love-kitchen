import { z } from 'zod';

export const apiErrorSchema = z.object({ code: z.string().min(1), message: z.unknown(), details: z.unknown().nullable() });
export const pageInfoSchema = z.object({ nextCursor: z.string().nullable(), hasNextPage: z.boolean() });
export const cursorPageSchema = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item), pageInfo: pageInfoSchema });
export const dishCategorySchema = z.enum(['MEAT', 'VEGETABLE', 'SOUP_PORRIDGE', 'DESSERT_SNACK', 'WESTERN', 'SEAFOOD', 'DRINK', 'STAPLE', 'OTHER']);
export const dishKindSchema = z.enum(['PERMANENT', 'TEMPORARY']);
export const dishV2Schema = z.object({
  id: z.string().uuid(),
  kitchenId: z.string().uuid(),
  name: z.string().min(1),
  category: dishCategorySchema,
  kind: dishKindSchema,
  notes: z.string().nullable().optional(),
  story: z.string().nullable().optional(),
  effectiveDate: z.coerce.date().nullable().optional(),
  ratingAverage: z.number().min(1).max(5).nullable().optional(),
  ratingCount: z.number().int().nonnegative().optional(),
  images: z.array(z.object({ uploadId: z.string().uuid(), sortOrder: z.number().int().nonnegative(), isCover: z.boolean() })).optional(),
  createdAt: z.coerce.date(),
}).passthrough();
export const dishesPageV2Schema = cursorPageSchema(dishV2Schema);
export const timelineEventV2Schema = z.object({ id: z.string().uuid(), kitchenId: z.string().uuid(), title: z.string().min(1), eventType: z.string().min(1), eventDate: z.coerce.date(), createdAt: z.coerce.date() }).passthrough();
export const timelinePageV2Schema = cursorPageSchema(timelineEventV2Schema);
export const mealLogV2Schema = z.object({ id: z.string().uuid(), kitchenId: z.string().uuid(), eatenAt: z.coerce.date(), mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']), servings: z.number().positive(), eaterUserIds: z.array(z.string().uuid()), createdAt: z.coerce.date() }).passthrough();
export const mealHistoryPageV2Schema = cursorPageSchema(mealLogV2Schema);
export const notificationV2Schema = z.object({ id: z.string().uuid(), kitchenId: z.string().uuid(), userId: z.string().uuid(), type: z.string().min(1), title: z.string().min(1), content: z.string(), readAt: z.coerce.date().nullable(), createdAt: z.coerce.date() }).passthrough();
export const notificationsPageV2Schema = cursorPageSchema(notificationV2Schema);
export const aiConversationV2Schema = z.object({ id: z.string().uuid(), kitchenId: z.string().uuid(), userId: z.string().uuid(), purpose: z.string().min(1), title: z.string().nullable(), createdAt: z.coerce.date(), updatedAt: z.coerce.date() }).passthrough();
export const aiConversationsPageV2Schema = cursorPageSchema(aiConversationV2Schema);
export type PageInfo = z.infer<typeof pageInfoSchema>;
