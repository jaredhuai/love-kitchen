import { IsBoolean, IsDateString, IsOptional, IsString, Length } from 'class-validator';
export class StoryDto { @IsString() @Length(1, 120) title!: string; @IsString() @Length(1, 10000) content!: string; @IsDateString() storyDate!: string; @IsOptional() @IsString() storyType?: string; @IsOptional() @IsBoolean() isPinned?: boolean; }
export class AnniversaryDto { @IsString() @Length(1, 80) name!: string; @IsString() @Length(1, 40) type!: string; @IsDateString() date!: string; @IsOptional() @IsBoolean() repeatsYearly?: boolean; @IsOptional() @IsString() notes?: string; }
