import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/app-exception';

export const pantryUnavailable = () => new AppException('PANTRY_ITEM_UNAVAILABLE', '库存不存在或数量不足', HttpStatus.NOT_FOUND);
export const shoppingItemNotFound = () => new AppException('RESOURCE_NOT_FOUND', '购物项不存在', HttpStatus.NOT_FOUND);
