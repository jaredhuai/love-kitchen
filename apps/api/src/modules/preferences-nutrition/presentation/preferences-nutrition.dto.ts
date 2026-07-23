import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsNumber, IsString, Max, Min, ValidateNested } from 'class-validator';

const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;
export class PreferenceDto { @IsArray() @IsString({ each: true }) cuisines!: string[]; @IsArray() @IsString({ each: true }) tastes!: string[]; @IsArray() @IsString({ each: true }) ingredients!: string[]; @IsInt() @Min(0) @Max(4) spicyLevel!: number; @IsInt() @Min(1) maxMinutes!: number; @IsNumber() @Min(0) budget!: number; @IsNumber() @Min(0) calorieTarget!: number; }
export class PreferenceQuery { @IsDateString() date!: string; @IsIn(MEAL_TYPES) mealType!: (typeof MEAL_TYPES)[number]; }
export class NutrientDto { @IsNumber() @Min(0) weightGrams!: number; @IsNumber() @Min(0) caloriesPer100g!: number; @IsNumber() @Min(0) proteinPer100g!: number; @IsNumber() @Min(0) fatPer100g!: number; @IsNumber() @Min(0) carbsPer100g!: number; }
export class NutritionDto { @IsArray() @ValidateNested({ each: true }) @Type(() => NutrientDto) items!: NutrientDto[]; @IsInt() @Min(1) servings!: number; }
export const isMealType = (value: string) => (MEAL_TYPES as readonly string[]).includes(value);
