import { describe, expect, it } from 'vitest';
import { kitchenOpeningDay } from '../miniprogram/utils/opening-day';

describe('kitchen opening day', () => {
  it('shows zero before opening', () => {
    expect(kitchenOpeningDay(new Date(2026, 7, 17, 23, 59))).toBe(0);
  });

  it('starts at one on 2026-08-18 and increments by local calendar day', () => {
    expect(kitchenOpeningDay(new Date(2026, 7, 18, 0, 0))).toBe(1);
    expect(kitchenOpeningDay(new Date(2026, 7, 19, 12, 0))).toBe(2);
  });
});
