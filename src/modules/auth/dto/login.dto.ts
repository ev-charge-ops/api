import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { normalizeEmail } from './transforms.js';

export class LoginDto {
  @ApiProperty({ format: 'email', example: 'ana@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 's3cure-passw0rd' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
