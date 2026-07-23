import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateKitchenDto {
  @IsString() @Length(1, 80) name!: string;
  @IsOptional() @IsString() @Length(0, 160) slogan?: string;
  @IsOptional() @IsInt() @Min(1) @Max(12) defaultServings?: number;
}
