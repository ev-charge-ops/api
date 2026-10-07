import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { trimString } from './transforms.js';

export class AppleFullNameDto {
  @ApiPropertyOptional({ example: 'Ana', maxLength: 50 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(50)
  givenName?: string;

  @ApiPropertyOptional({ example: 'Souza', maxLength: 50 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(50)
  familyName?: string;
}

export class AppleLoginDto {
  @ApiProperty({ description: 'Identity token returned by Sign in with Apple' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  identityToken: string;

  @ApiPropertyOptional({
    type: () => AppleFullNameDto,
    description: 'Name shared by Apple on the first authorization only',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AppleFullNameDto)
  fullName?: AppleFullNameDto;
}
