import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;
const ASSIGNMENT_MODES = ['RANDOM', 'ALTERNATE', 'LESS_RECENTLY_COOKED', 'POINTS', 'MANUAL'] as const;

export class PlanDto { @IsDateString() weekStart!: string; @IsOptional() @IsString() title?: string; }
export class MealDto { @IsDateString() mealDate!: string; @IsIn(MEAL_TYPES) mealType!: (typeof MEAL_TYPES)[number]; @IsOptional() @IsString() dishId?: string; @IsInt() @Min(1) @Max(24) servings = 2; @IsOptional() @IsString() cookUserId?: string; }
export class UpdateMealDto { @IsOptional() @IsDateString() mealDate?: string; @IsOptional() @IsIn(MEAL_TYPES) mealType?: (typeof MEAL_TYPES)[number]; @IsOptional() @IsString() dishId?: string; @IsOptional() @IsInt() @Min(1) @Max(24) servings?: number; @IsOptional() @IsString() cookUserId?: string; }
export class VoteDto { @IsInt() @Min(-1) @Max(1) value!: number; }
export class AssignmentDto { @IsDateString() assignmentDate!: string; @IsIn(ASSIGNMENT_MODES) mode!: (typeof ASSIGNMENT_MODES)[number]; @IsOptional() @IsString() chefUserId?: string; @IsOptional() @IsString() assistantUserId?: string; @IsOptional() @IsString() dishwasherUserId?: string; @IsOptional() @IsString() shopperUserId?: string; }
