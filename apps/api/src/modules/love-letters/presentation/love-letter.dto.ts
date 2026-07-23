import { IsDateString, IsIn, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateLetterDto { @IsString() @Length(1, 120) title!: string; @IsString() @Length(1, 10000) content!: string; @IsString() recipientUserId!: string; @IsIn(['DATE', 'DISH_COUNT', 'MEAL_COUNT', 'MANUAL']) unlockType!: 'DATE' | 'DISH_COUNT' | 'MEAL_COUNT' | 'MANUAL'; @IsOptional() @IsDateString() unlockAt?: string; @IsOptional() @IsInt() @Min(1) unlockDishCount?: number; @IsOptional() @IsInt() @Min(1) unlockMealCount?: number; }
