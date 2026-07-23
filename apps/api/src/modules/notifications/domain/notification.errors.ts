import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/app-exception';

export const invalidNotificationCursor = () => new AppException('INVALID_CURSOR', '分页游标无效', HttpStatus.BAD_REQUEST);
export const notificationNotFound = () => new AppException('RESOURCE_NOT_FOUND', '通知不存在', HttpStatus.NOT_FOUND);
