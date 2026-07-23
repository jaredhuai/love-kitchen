import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/app-exception';

export const activeKitchenExists = () => new AppException('KITCHEN_MEMBERSHIP_CONFLICT', '你已经有一个有效厨房', HttpStatus.CONFLICT);
export const inviteNotFound = () => new AppException('RESOURCE_NOT_FOUND', '邀请码不存在', HttpStatus.NOT_FOUND);
export const inviteGone = (message: string) => new AppException('KITCHEN_INVITE_GONE', message, HttpStatus.GONE);
export const ownInviteForbidden = () => new AppException('KITCHEN_INVITE_SELF_JOIN', '不能加入自己创建的厨房', HttpStatus.CONFLICT);
export const otherKitchenExists = () => new AppException('KITCHEN_MEMBERSHIP_CONFLICT', '你已经有其他有效厨房', HttpStatus.CONFLICT);
export const kitchenFull = () => new AppException('KITCHEN_FULL', '厨房已满', HttpStatus.CONFLICT);
