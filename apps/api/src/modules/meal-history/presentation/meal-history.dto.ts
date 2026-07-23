import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;

export class MealLogDto {
  @IsDateString() eatenAt!: string;
  @IsIn(MEAL_TYPES) mealType!: (typeof MEAL_TYPES)[number];
  @IsOptional() @IsString() mealPlanId?: string;
  @IsOptional() @IsString() dishId?: string;
  @IsInt() @Min(1) servings = 2;
  @IsOptional() @IsArray() @IsString({ each: true }) eaterUserIds?: string[];
  @IsOptional() @IsString() cookedBy?: string;
}

export class MealHistoryCursorQueryDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}
