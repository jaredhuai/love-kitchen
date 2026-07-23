import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('app routing', () => {
  const manifest = JSON.parse(readFileSync(new URL('../miniprogram/app.json', import.meta.url), 'utf8'));
  it('keeps every tab route in the main package', () => {
    for (const tab of manifest.tabBar.list) expect(manifest.pages).toContain(tab.pagePath);
  });
  it('has unique main and feature routes', () => {
    const routes = [...manifest.pages, ...manifest.subpackages.flatMap((item: any) => item.pages.map((page: string) => `${item.root}/${page}`))];
    expect(new Set(routes).size).toBe(routes.length);
  });
});
