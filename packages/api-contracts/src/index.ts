import { z } from 'zod';

export const apiErrorSchema = z.object({ code: z.string().min(1), message: z.unknown(), details: z.unknown().nullable() });
export const pageInfoSchema = z.object({ nextCursor: z.string().nullable(), hasNextPage: z.boolean() });
export const cursorPageSchema = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item), pageInfo: pageInfoSchema });
export const dishV2Schema = z.object({ id: z.string().uuid(), kitchenId: z.string().uuid(), name: z.string().min(1), createdAt: z.coerce.date() }).passthrough();
export const dishesPageV2Schema = cursorPageSchema(dishV2Schema);
export const timelineEventV2Schema = z.object({ id: z.string().uuid(), kitchenId: z.string().uuid(), title: z.string().min(1), eventType: z.string().min(1), eventDate: z.coerce.date(), createdAt: z.coerce.date() }).passthrough();
export const timelinePageV2Schema = cursorPageSchema(timelineEventV2Schema);
export const mealLogV2Schema = z.object({ id: z.string().uuid(), kitchenId: z.string().uuid(), eatenAt: z.coerce.date(), mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']), servings: z.number().positive(), eaterUserIds: z.array(z.string().uuid()), createdAt: z.coerce.date() }).passthrough();
export const mealHistoryPageV2Schema = cursorPageSchema(mealLogV2Schema);
export const notificationV2Schema = z.object({ id: z.string().uuid(), kitchenId: z.string().uuid(), userId: z.string().uuid(), type: z.string().min(1), title: z.string().min(1), content: z.string(), readAt: z.coerce.date().nullable(), createdAt: z.coerce.date() }).passthrough();
export const notificationsPageV2Schema = cursorPageSchema(notificationV2Schema);
export type PageInfo = z.infer<typeof pageInfoSchema>;
