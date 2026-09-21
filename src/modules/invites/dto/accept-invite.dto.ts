import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { trimString } from '../../auth/dto/transforms.js';

export class AcceptInviteDto {
  @ApiProperty({ example: 'Ana Souza', maxLength: 100 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ minLength: 8, maxLength: 128, example: 's3cure-passw0rd' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
