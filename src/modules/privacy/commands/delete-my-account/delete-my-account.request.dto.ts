import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsOptional, IsString, MaxLength } from 'class-validator';

export const DELETE_ACCOUNT_CONFIRMATION = 'EXCLUIR';

export class DeleteMyAccountRequestDto {
  @ApiPropertyOptional({
    maxLength: 128,
    description:
      'Current password; required when the account has one (hasPassword), ignored for Google, Apple or email code accounts',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;

  @ApiProperty({
    enum: [DELETE_ACCOUNT_CONFIRMATION],
    example: DELETE_ACCOUNT_CONFIRMATION,
    description: 'Typed by the user to confirm the deletion',
  })
  @Equals(DELETE_ACCOUNT_CONFIRMATION, {
    message: `confirm must be ${DELETE_ACCOUNT_CONFIRMATION}`,
  })
  confirm: string;
}
