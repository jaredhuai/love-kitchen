import { describe, expect, it } from 'vitest';
import { aiConversationsPageV2Schema, dishesPageV2Schema, mealHistoryPageV2Schema, notificationsPageV2Schema, timelinePageV2Schema } from './index';
describe('API v2 contracts', () => {
  it('accepts cursor page and rejects offset shapes', () => {
    expect(dishesPageV2Schema.safeParse({ items: [], pageInfo: { nextCursor: null, hasNextPage: false } }).success).toBe(true);
    expect(dishesPageV2Schema.safeParse({ items: [], page: 1, total: 0 }).success).toBe(false);
  });
  it('validates timeline event pages with stable dates', () => {
    const event = { id: '70000000-0000-4000-8000-000000000001', kitchenId: '70000000-0000-4000-8000-000000000002', title: '初遇', eventType: 'CUSTOM', eventDate: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' };
    expect(timelinePageV2Schema.safeParse({ items: [event], pageInfo: { nextCursor: null, hasNextPage: false } }).success).toBe(true);
    expect(timelinePageV2Schema.safeParse({ items: [{ ...event, eventDate: 'invalid' }], pageInfo: { nextCursor: null, hasNextPage: false } }).success).toBe(false);
  });
  it('validates meal history pages and meal types', () => {
    const log = { id: '72000000-0000-4000-8000-000000000001', kitchenId: '72000000-0000-4000-8000-000000000002', eatenAt: '2026-03-01T00:00:00.000Z', mealType: 'DINNER', servings: 2, eaterUserIds: ['72000000-0000-4000-8000-000000000003'], createdAt: '2026-03-01T00:00:00.000Z' };
    expect(mealHistoryPageV2Schema.safeParse({ items: [log], pageInfo: { nextCursor: null, hasNextPage: false } }).success).toBe(true);
    expect(mealHistoryPageV2Schema.safeParse({ items: [{ ...log, mealType: 'BRUNCH' }], pageInfo: { nextCursor: null, hasNextPage: false } }).success).toBe(false);
  });
  it('validates notification pages and nullable read state', () => {
    const notification = { id: '73000000-0000-4000-8000-000000000001', kitchenId: '73000000-0000-4000-8000-000000000002', userId: '73000000-0000-4000-8000-000000000003', type: 'REMINDER', title: '提醒', content: '今天做饭', readAt: null, createdAt: '2026-05-01T00:00:00.000Z' };
    expect(notificationsPageV2Schema.safeParse({ items: [notification], pageInfo: { nextCursor: null, hasNextPage: false } }).success).toBe(true);
    expect(notificationsPageV2Schema.safeParse({ items: [{ ...notification, title: '' }], pageInfo: { nextCursor: null, hasNextPage: false } }).success).toBe(false);
  });
  it('validates AI conversation pages', () => {
    const conversation = { id: '74000000-0000-4000-8000-000000000001', kitchenId: '74000000-0000-4000-8000-000000000002', userId: '74000000-0000-4000-8000-000000000003', purpose: 'RECOMMENDATION', title: null, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' };
    expect(aiConversationsPageV2Schema.safeParse({ items: [conversation], pageInfo: { nextCursor: null, hasNextPage: false } }).success).toBe(true);
    expect(aiConversationsPageV2Schema.safeParse({ items: [{ ...conversation, purpose: '' }], pageInfo: { nextCursor: null, hasNextPage: false } }).success).toBe(false);
  });
});
