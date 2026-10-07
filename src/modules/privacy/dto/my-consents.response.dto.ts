import { ApiProperty } from '@nestjs/swagger';
import { ConsentPurpose } from '../../../generated/prisma/enums.js';
import type { ConsentState } from '../domain/consent-purposes.js';

export class ConsentPurposeStateDto {
  @ApiProperty({ enum: ConsentPurpose, enumName: 'ConsentPurpose' })
  purpose: ConsentPurpose;

  @ApiProperty({
    description:
      'Required purposes are granted on acceptance and cannot be revoked',
  })
  required: boolean;

  @ApiProperty({ example: 'Rateio com o condomínio' })
  title: string;

  @ApiProperty({
    example:
      'Compartilhar com a gestão do seu condomínio a energia, o horário e o valor de cada recarga para o rateio na taxa condominial.',
  })
  description: string;

  @ApiProperty({ description: 'Latest choice; false when never recorded' })
  granted: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-10-07',
    description: 'Terms version of the latest choice',
  })
  termsVersion: string | null;

  @ApiProperty({ type: Date, nullable: true })
  recordedAt: Date | null;
}

export class MyConsentsResponseDto {
  @ApiProperty({ example: '2026-10-07', description: 'Current terms version' })
  termsVersion: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-10-07',
    description:
      'Terms version under which the required purposes were last granted',
  })
  acceptedTermsVersion: string | null;

  @ApiProperty({
    description:
      'True when the user has not accepted the current terms version and must accept them again',
  })
  mustAccept: boolean;

  @ApiProperty({ type: [ConsentPurposeStateDto] })
  purposes: ConsentPurposeStateDto[];

  static fromState(state: ConsentState): MyConsentsResponseDto {
    return Object.assign(new MyConsentsResponseDto(), {
      termsVersion: state.termsVersion,
      acceptedTermsVersion: state.acceptedTermsVersion,
      mustAccept: state.mustAccept,
      purposes: state.purposes.map((purpose) =>
        Object.assign(new ConsentPurposeStateDto(), purpose),
      ),
    });
  }
}
