import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/app-exception';

export const mealPlanNotFound = () => new AppException('MEAL_PLAN_NOT_FOUND', '菜单项不存在', HttpStatus.NOT_FOUND);
