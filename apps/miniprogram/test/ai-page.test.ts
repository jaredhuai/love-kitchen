import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const homeTs = readFileSync(new URL('../miniprogram/pages/home/index.ts', import.meta.url), 'utf8');
const aiTs = readFileSync(new URL('../miniprogram/pages/ai/index.ts', import.meta.url), 'utf8');
const aiWxml = readFileSync(new URL('../miniprogram/pages/ai/index.wxml', import.meta.url), 'utf8');

describe('hidden AI chef page', () => {
  it('does not expose an AI entry on the home page', () => {
    expect(homeTs).not.toContain("wx.navigateTo({ url: '/pages/ai/index' })");
  });

  it('sends the required idempotency key and renders structured recommendations', () => {
    expect(aiTs).toContain('idempotencyKey: `ai-recommend-');
    expect(aiTs).toContain('result.recommendations');
    expect(aiWxml).toContain('item.reason');
    expect(aiWxml).toContain('item.ingredients');
  });
});
