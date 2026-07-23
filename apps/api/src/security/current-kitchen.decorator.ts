import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export const CurrentKitchen = createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest().kitchen);
export const CurrentMembership = createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest().membership);
