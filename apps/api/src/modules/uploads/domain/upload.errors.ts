import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/app-exception';

export const invalidUpload = (message: string) => new AppException('UPLOAD_INVALID_CONTENT', message, HttpStatus.BAD_REQUEST);
export const uploadNotFound = () => new AppException('RESOURCE_NOT_FOUND', '文件不存在', HttpStatus.NOT_FOUND);
