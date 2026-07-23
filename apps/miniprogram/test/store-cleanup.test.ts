import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, unknown>();
beforeEach(() => { vi.resetModules(); storage.clear(); (globalThis as any).wx = { getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value), removeStorageSync: (key: string) => storage.delete(key) }; });

describe('cross-account cleanup', () => {
  it('removes all account-scoped persisted state', async () => {
    const auth = await import('../miniprogram/stores/auth.store'); const kitchen = await import('../miniprogram/stores/kitchen.store');
    const user = await import('../miniprogram/stores/user.store'); const membership = await import('../miniprogram/stores/membership.store'); const flags = await import('../miniprogram/stores/feature-flag.store');
    auth.setSession({ accessToken: 'a', refreshToken: 'r' }); kitchen.setKitchen({ id: 'k' }); user.setUser({ id: 'u', nickname: 'n' }); membership.setMemberships([{ kitchenId: 'k', role: 'OWNER' }]); flags.setFeatureFlags({ v2: true });
    const { clearAllStores } = await import('../miniprogram/stores/store-registry'); clearAllStores();
    expect([...storage.keys()].filter((key) => ['accessToken', 'refreshToken', 'kitchen', 'user', 'memberships', 'featureFlags'].includes(key))).toEqual([]);
  });
});
