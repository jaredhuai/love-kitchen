import type { TokenPair } from '../contracts/api';
import { clearRefreshToken, setRefreshToken } from '../utils/session';

let accessToken: string | null = null;
export function setAccessToken(token: string) { accessToken = token; wx.setStorageSync('accessToken', token); }
export function getAccessToken() { return accessToken || wx.getStorageSync('accessToken') || ''; }
export function setSession(session: Pick<TokenPair, 'accessToken' | 'refreshToken'>) { setAccessToken(session.accessToken); setRefreshToken(session.refreshToken); }
export function clearAuth() { accessToken = null; wx.removeStorageSync('accessToken'); clearRefreshToken(); }
