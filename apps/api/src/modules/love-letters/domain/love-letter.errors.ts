import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/app-exception';

export const loveLetterNotFound = () => new AppException('RESOURCE_NOT_FOUND', '情书不存在', HttpStatus.NOT_FOUND);
export const invalidLetterCondition = (message: string) => new AppException('LOVE_LETTER_INVALID_CONDITION', message, HttpStatus.BAD_REQUEST);
export const invalidLetterRecipient = () => new AppException('LOVE_LETTER_INVALID_RECIPIENT', '收件人必须是厨房中的另一位成员', HttpStatus.BAD_REQUEST);
