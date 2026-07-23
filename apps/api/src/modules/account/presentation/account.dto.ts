import { IsString, IsUUID, Length } from 'class-validator';

export class JobIdDto {
  @IsUUID() jobId!: string;
}
export class RecoveryDto {
  @IsString() @Length(32, 200) recoveryToken!: string;
}
