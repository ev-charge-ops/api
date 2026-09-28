import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { PushPlatform } from '../../../../generated/prisma/enums.js';
import { trimString } from '../../../auth/dto/transforms.js';

export const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]\s]+\]$/;

export class RegisterPushTokenRequestDto {
  @ApiProperty({
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    pattern: EXPO_PUSH_TOKEN_PATTERN.source,
  })
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  @Matches(EXPO_PUSH_TOKEN_PATTERN, {
    message: 'token must be an Expo push token',
  })
  token: string;

  @ApiProperty({ enum: PushPlatform, enumName: 'PushPlatform' })
  @IsIn(Object.values(PushPlatform))
  platform: PushPlatform;
}
