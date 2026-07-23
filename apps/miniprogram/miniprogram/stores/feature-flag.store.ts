export type FeatureFlags = Readonly<Record<string, boolean>>;
let flags: FeatureFlags = {};
export function setFeatureFlags(value: FeatureFlags) { flags = { ...value }; wx.setStorageSync('featureFlags', flags); }
export function getFeatureFlags(): FeatureFlags { return Object.keys(flags).length ? flags : wx.getStorageSync('featureFlags') || {}; }
export function isFeatureEnabled(name: string) { return getFeatureFlags()[name] === true; }
export function clearFeatureFlags() { flags = {}; wx.removeStorageSync('featureFlags'); }
