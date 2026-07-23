import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/app-exception';

export const preferenceLocked = (revealed: boolean) => new AppException(revealed ? 'PREFERENCE_ALREADY_REVEALED' : 'PREFERENCE_SESSION_LOCKED', '当前偏好场次已锁定，不能提交或修改', HttpStatus.CONFLICT);
export const preferenceNotReady = () => new AppException('PREFERENCE_NOT_READY', '双方提交偏好后才能揭晓', HttpStatus.BAD_REQUEST);
export const preferenceStateConflict = () => new AppException('PREFERENCE_STATE_CONFLICT', '偏好状态更新冲突，请重试', HttpStatus.CONFLICT);
