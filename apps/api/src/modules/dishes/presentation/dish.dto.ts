import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export const DISH_CATEGORIES = ['MEAT', 'VEGETABLE', 'SOUP_PORRIDGE', 'DESSERT_SNACK', 'WESTERN', 'SEAFOOD', 'DRINK', 'STAPLE', 'OTHER'] as const;
export const DISH_KINDS = ['PERMANENT', 'TEMPORARY'] as const;
export const TEMPORARY_MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;

export class DishDto {
  @IsString() @Length(1, 100) name!: string;
  @IsOptional() @IsString() @Length(0, 1000) description?: string;
  @IsOptional() @IsString() @Length(0, 2000) notes?: string;
  @IsOptional() @IsString() @Length(0, 3000) story?: string;
  @IsOptional() @IsIn(DISH_CATEGORIES) category?: (typeof DISH_CATEGORIES)[number];
  @IsOptional() @IsIn(DISH_KINDS) kind?: (typeof DISH_KINDS)[number];
  @IsOptional() @IsDateString() effectiveDate?: string;
  @IsOptional() @IsIn(TEMPORARY_MEAL_TYPES) temporaryMealType?: (typeof TEMPORARY_MEAL_TYPES)[number];
  @IsOptional() @IsString() cuisine?: string;
  @IsOptional() @IsInt() @Min(1) @Max(24) servings?: number;
  @IsOptional() @IsString() coverImageUrl?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(9) @IsUUID('4', { each: true }) imageUploadIds?: string[];
  @IsOptional() @IsBoolean() isFavorite?: boolean;
}

export class UpdateDishDto {
  @IsOptional() @IsString() @Length(1, 100) name?: string;
  @IsOptional() @IsString() @Length(0, 1000) description?: string;
  @IsOptional() @IsString() @Length(0, 2000) notes?: string;
  @IsOptional() @IsString() @Length(0, 3000) story?: string;
  @IsOptional() @IsIn(DISH_CATEGORIES) category?: (typeof DISH_CATEGORIES)[number];
  @IsOptional() @IsIn(DISH_KINDS) kind?: (typeof DISH_KINDS)[number];
  @IsOptional() @IsDateString() effectiveDate?: string;
  @IsOptional() @IsIn(TEMPORARY_MEAL_TYPES) temporaryMealType?: (typeof TEMPORARY_MEAL_TYPES)[number];
  @IsOptional() @IsString() cuisine?: string;
  @IsOptional() @IsInt() @Min(1) @Max(24) servings?: number;
  @IsOptional() @IsString() coverImageUrl?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(9) @IsUUID('4', { each: true }) imageUploadIds?: string[];
  @IsOptional() @IsBoolean() isFavorite?: boolean;
}
export class ReviewDto { @IsInt() @Min(1) @Max(5) tasteRating!: number; @IsInt() @Min(1) @Max(5) appearanceRating!: number; @IsInt() @Min(1) @Max(5) careRating!: number; @IsOptional() @IsString() @Length(0, 500) content?: string; @IsOptional() @IsBoolean() eatAgain?: boolean; }
export class DishPageQueryDto { @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20; }
export class DishCursorQueryDto { @IsOptional() @IsString() cursor?: string; @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20; }
