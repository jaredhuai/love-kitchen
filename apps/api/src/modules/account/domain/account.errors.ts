import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/app-exception';

export const accountJobNotFound = () =>
  new AppException('ACCOUNT_JOB_NOT_FOUND', '任务不存在', HttpStatus.NOT_FOUND);
export const accountJobConflict = (message: string) =>
  new AppException('ACCOUNT_JOB_CONFLICT', message, HttpStatus.CONFLICT);
export const accountCoolingOff = () =>
  new AppException('ACCOUNT_COOLING_OFF', '注销仍在冷静期', HttpStatus.CONFLICT);
export const invalidRecoveryToken = () =>
  new AppException('ACCOUNT_RECOVERY_TOKEN_INVALID', '恢复凭证无效', HttpStatus.UNAUTHORIZED);
