import type { TokenPair } from '../../contracts/api';
import { ENV } from '../../config/env';
import { setSession } from '../../stores/auth.store';
import { setKitchen } from '../../stores/kitchen.store';
import { setMemberships } from '../../stores/membership.store';
import { setUser } from '../../stores/user.store';
import { request } from '../../utils/request';
import { kitchenOpeningDay } from '../../utils/opening-day';

Page({
  data: { loading: false, openingDay: kitchenOpeningDay(), canUseDevLogin: ENV.environment === 'development' },
  openPrivacy() { wx.navigateTo({ url: '/pages/legal/privacy' }); },
  openTerms() { wx.navigateTo({ url: '/pages/legal/terms' }); },
  async wechatLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      await requirePrivacyAuthorization();
      const login = await wx.login();
      if (!login.code) throw new Error('微信登录凭证为空');
      await this.completeLogin('/auth/wechat-login', { code: login.code, deviceId: deviceId() });
    } catch (error) { wx.showToast({ title: error instanceof Error ? error.message : '登录失败，请重试', icon: 'none' }); }
    finally { this.setData({ loading: false }); }
  },
  async devLogin() {
    if (!this.data.canUseDevLogin || this.data.loading) return;
    this.setData({ loading: true });
    try { await this.completeLogin('/auth/dev-login', { userKey: 'user-a', deviceId: deviceId() }); }
    catch (error) { wx.showToast({ title: error instanceof Error ? error.message : '登录失败', icon: 'none' }); }
    finally { this.setData({ loading: false }); }
  },
  async completeLogin(path: string, data: WechatMiniprogram.IAnyObject) {
    const result = await request<TokenPair>(path, { method: 'POST', data, skipAuth: true });
    setSession(result); setUser(result.user);
    if (result.kitchen) { setKitchen(result.kitchen); setMemberships([result.kitchen]); }
    wx.reLaunch({ url: result.kitchen ? '/pages/home/index' : '/pages/auth/login' });
  },
});

function deviceId() {
  const current = wx.getStorageSync('deviceId');
  if (current) return current as string;
  const value = `mp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  wx.setStorageSync('deviceId', value); return value;
}

async function requirePrivacyAuthorization() {
  const api = wx as unknown as { requirePrivacyAuthorize?: (options: { success(): void; fail(error: { errMsg?: string }): void }) => void };
  if (!api.requirePrivacyAuthorize) return;
  await new Promise<void>((resolve, reject) => api.requirePrivacyAuthorize?.({ success: resolve, fail: (error) => reject(new Error(error.errMsg || '需要隐私授权')) }));
}
