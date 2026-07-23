import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/app-exception';

export const invalidMealHistoryCursor = () => new AppException('INVALID_CURSOR', '分页游标无效', HttpStatus.BAD_REQUEST);
