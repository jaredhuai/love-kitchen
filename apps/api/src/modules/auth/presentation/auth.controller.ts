import { Body, Controller, Inject, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../../security/current-user.decorator';
import { Public } from '../../../security/public.decorator';
import { AuthService } from '../application/auth.service';
import { DevLoginDto, RefreshDto, WechatLoginDto } from './auth.dto';

@ApiTags('auth') @Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Public() @Post('dev-login') dev(@Body() dto: DevLoginDto, @Req() request: Request) { return this.auth.devLogin(dto.userKey, this.context(request, dto.deviceId)); }
  @Public() @Post('wechat-login') wechat(@Body() dto: WechatLoginDto, @Req() request: Request) { return this.auth.wechatLogin(dto.code, this.context(request, dto.deviceId)); }
  @Public() @Post('refresh') refresh(@Body() dto: RefreshDto, @Req() request: Request) { return this.auth.refresh(dto.refreshToken, this.context(request, dto.deviceId)); }
  @Post('logout') logout(@CurrentUser() user: { id: string }, @Body() dto: RefreshDto) { return this.auth.logout(user.id, dto.refreshToken); }
  @Post('logout-all') logoutAll(@CurrentUser() user: { id: string }) { return this.auth.logoutAll(user.id); }
  private context(request: Request, deviceId?: string) {
    const userAgent = request.get('user-agent');
    return { requestId: request.requestId, ...(deviceId ? { deviceId } : {}), ...(userAgent ? { userAgent } : {}) };
  }
}
