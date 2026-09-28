import { ApiProperty } from '@nestjs/swagger';
import { PushPlatform } from '../../../../generated/prisma/enums.js';

export class PushTokenResponseDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  token: string;

  @ApiProperty({ enum: PushPlatform, enumName: 'PushPlatform' })
  platform: PushPlatform;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}
