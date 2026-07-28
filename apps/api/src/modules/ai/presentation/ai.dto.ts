import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class RecommendationDto {
  @IsOptional() @IsString() @Length(0, 1000) request?: string;
  @IsOptional() @IsInt() @Min(1) @Max(12) servings?: number;
}

export class AiConversationCursorQueryDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}
