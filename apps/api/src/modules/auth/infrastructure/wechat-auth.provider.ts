import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { invalidWechatCode, wechatNotConfigured, wechatTimeout, wechatUnavailable } from '../domain/auth.errors';

export const WECHAT_AUTH_PROVIDER = Symbol('WECHAT_AUTH_PROVIDER');

export type WechatIdentityResult = { appId: string; openId: string; unionId?: string };

export interface WechatAuthProvider { exchange(code: string): Promise<WechatIdentityResult>; }

@Injectable()
export class WechatCodeProvider implements WechatAuthProvider {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async exchange(code: string): Promise<WechatIdentityResult> {
    const appId = this.config.get<string>('WECHAT_APP_ID');
    const secret = this.config.get<string>('WECHAT_APP_SECRET');
    if (!appId || !secret) throw wechatNotConfigured();
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', appId); url.searchParams.set('secret', secret);
    url.searchParams.set('js_code', code); url.searchParams.set('grant_type', 'authorization_code');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.get<number>('WECHAT_LOGIN_TIMEOUT_MS') ?? 5000);
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw wechatTimeout();
      throw wechatUnavailable();
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw wechatUnavailable();
    const payload = await response.json() as { openid?: string; unionid?: string; errcode?: number; errmsg?: string; session_key?: string };
    if (!payload.openid || payload.errcode) throw invalidWechatCode(payload.errmsg ?? '微信登录凭证无效');
    return { appId, openId: payload.openid, ...(payload.unionid ? { unionId: payload.unionid } : {}) };
  }
}
