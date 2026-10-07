import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ConsentPurpose } from '../../../../generated/prisma/enums.js';
import { trimString } from '../../../auth/dto/transforms.js';

export class ConsentChoiceDto {
  @ApiProperty({ enum: ConsentPurpose, enumName: 'ConsentPurpose' })
  @IsIn(Object.values(ConsentPurpose))
  purpose: ConsentPurpose;

  @ApiProperty()
  @IsBoolean()
  granted: boolean;
}

export class UpdateMyConsentsRequestDto {
  @ApiProperty({
    example: '2026-10-07',
    description:
      'Terms version shown to the user; must be the current one returned by getMyConsents',
  })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  termsVersion: string;

  @ApiProperty({
    type: [ConsentChoiceDto],
    description:
      'Choices to record; required purposes are always granted and omitted optional purposes keep their latest choice',
  })
  @IsArray()
  @ArrayMaxSize(Object.values(ConsentPurpose).length)
  @ArrayUnique((choice: ConsentChoiceDto) => choice.purpose, {
    message: 'each purpose may appear only once',
  })
  @ValidateNested({ each: true })
  @Type(() => ConsentChoiceDto)
  consents: ConsentChoiceDto[];
}
