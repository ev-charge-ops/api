import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { trimString } from './transforms.js';

export class UpdateMyProfileDto {
  @ApiProperty({ example: 'Ana Souza', minLength: 2, maxLength: 100 })
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}
