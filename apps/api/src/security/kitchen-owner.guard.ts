import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
@Injectable() export class KitchenOwnerGuard implements CanActivate { canActivate(ctx: ExecutionContext) { const member = ctx.switchToHttp().getRequest().membership as {role?:string}|undefined; if(member?.role!=='OWNER') throw new ForbiddenException('仅厨房创建者可执行此操作'); return true; } }
