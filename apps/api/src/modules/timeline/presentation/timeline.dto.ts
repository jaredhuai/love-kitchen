import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class TimelineDto {
  @IsString() @Length(1, 120) title!: string;
  @IsString() @Length(1, 40) eventType!: string;
  @IsDateString() eventDate!: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
}

export class TimelineCursorQueryDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}
