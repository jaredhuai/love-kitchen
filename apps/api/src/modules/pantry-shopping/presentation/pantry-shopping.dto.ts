import { IsNumber, IsOptional, IsPositive, IsString, Length, Min } from 'class-validator';

export class PantryDto { @IsString() @Length(1, 80) name!: string; @IsNumber() @Min(0) quantity!: number; @IsString() @Length(1, 20) unit!: string; @IsOptional() @IsString() storageLocation?: 'FRIDGE'|'FREEZER'|'PANTRY'|'OTHER'; @IsOptional() @IsString() notes?: string; }
export class ConsumeDto { @IsNumber() @IsPositive() quantity!: number; }
export class ShoppingDto { @IsString() @Length(1, 80) name!: string; @IsOptional() @IsNumber() @Min(0) quantity?: number; @IsOptional() @IsString() unit?: string; @IsOptional() @IsString() category?: string; }
