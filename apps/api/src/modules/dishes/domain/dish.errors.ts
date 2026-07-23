import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/app-exception';
export const dishNotFound = () => new AppException('RESOURCE_NOT_FOUND', '菜品不存在', HttpStatus.NOT_FOUND);
export const dishUpdateEmpty = () => new AppException('VALIDATION_FAILED', '至少提供一个要更新的字段', HttpStatus.BAD_REQUEST);
