import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

export const devLoginForbidden = () =>
  new ForbiddenException({
    code: 'AUTH_DEV_LOGIN_FORBIDDEN',
    message: '生产环境不支持模拟登录',
    details: null,
  });
export const wechatNotConfigured = () =>
  new ServiceUnavailableException({
    code: 'AUTH_WECHAT_NOT_CONFIGURED',
    message: '微信登录尚未配置',
    details: null,
  });
export const wechatUnavailable = () =>
  new ServiceUnavailableException({
    code: 'AUTH_WECHAT_UNAVAILABLE',
    message: '微信登录服务不可用',
    details: null,
  });
export const wechatTimeout = () =>
  new ServiceUnavailableException({
    code: 'AUTH_WECHAT_TIMEOUT',
    message: '微信登录服务响应超时',
    details: null,
  });
export const invalidWechatCode = (message: string) =>
  new BadRequestException({ code: 'AUTH_WECHAT_CODE_INVALID', message, details: null });
export const invalidRefreshToken = () =>
  new UnauthorizedException({
    code: 'AUTH_REFRESH_TOKEN_INVALID',
    message: '刷新令牌无效',
    details: null,
  });
export const refreshTokenReused = () =>
  new UnauthorizedException({
    code: 'AUTH_REFRESH_TOKEN_REUSED',
    message: '检测到刷新令牌重用，请重新登录',
    details: null,
  });
export const accountUnavailable = () =>
  new ForbiddenException({
    code: 'AUTH_ACCOUNT_UNAVAILABLE',
    message: '账号正在注销或已停用',
    details: null,
  });
export const invalidKitchenPassword = () =>
  new UnauthorizedException({
    code: 'AUTH_KITCHEN_PASSWORD_INVALID',
    message: '访问密码不正确',
    details: null,
  });
export const kitchenMemberLimitReached = () =>
  new ForbiddenException({
    code: 'AUTH_KITCHEN_MEMBER_LIMIT_REACHED',
    message: '“德德与桐桐”已有两位成员',
    details: null,
  });
