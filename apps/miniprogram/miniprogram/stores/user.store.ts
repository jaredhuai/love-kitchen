import type { UserContract } from '../contracts/api';
let current: UserContract | null = null;
export function setUser(user: UserContract) { current = user; wx.setStorageSync('user', user); }
export function getUser() { return current || wx.getStorageSync('user') || null; }
export function clearUser() { current = null; wx.removeStorageSync('user'); }
