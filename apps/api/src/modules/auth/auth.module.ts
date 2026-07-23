import { Module } from '@nestjs/common';
import { AuthService } from './application/auth.service';
import { AuthController } from './presentation/auth.controller';
import { WECHAT_AUTH_PROVIDER, WechatCodeProvider } from './infrastructure/wechat-auth.provider';

@Module({ controllers: [AuthController], providers: [WechatCodeProvider, { provide: WECHAT_AUTH_PROVIDER, useExisting: WechatCodeProvider }, AuthService], exports: [AuthService] })
export class AuthModule {}
