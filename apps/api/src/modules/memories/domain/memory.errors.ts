import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/app-exception';
export const storyNotFound = () => new AppException('RESOURCE_NOT_FOUND', '故事不存在', HttpStatus.NOT_FOUND);
