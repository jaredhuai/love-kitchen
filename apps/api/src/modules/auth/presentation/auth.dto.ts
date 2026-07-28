import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

class DeviceDto { @IsOptional() @IsString() @Length(1, 128) deviceId?: string; }
export class DevLoginDto extends DeviceDto { @ApiProperty({ example: 'user-a' }) @IsString() @Length(1, 40) userKey!: string; }
export class RefreshDto extends DeviceDto { @IsString() @Length(20, 1000) refreshToken!: string; }
export class WechatLoginDto extends DeviceDto {
  @IsString() @Length(1, 512) code!: string;
}
