import { ApiProperty } from '@nestjs/swagger';
import {
  LocationMode,
  PaymentMode,
  Role,
} from '../../../generated/prisma/enums.js';
import type { User } from '../../../generated/prisma/client.js';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Ana Souza' })
  name: string;

  @ApiProperty({ format: 'email', example: 'ana@example.com' })
  email: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role: Role;

  @ApiProperty({ description: 'Whether the user confirmed their email' })
  emailVerified: boolean;

  @ApiProperty({
    description:
      'Whether the user has a password; accounts created with Google, Apple or an email code may not',
  })
  hasPassword: boolean;

  @ApiProperty({
    enum: PaymentMode,
    enumName: 'PaymentMode',
    description:
      'Stripe mode used for the card payments of this user: TEST (test cards) or LIVE (real cards)',
  })
  paymentMode: PaymentMode;

  @ApiProperty({
    enum: LocationMode,
    enumName: 'LocationMode',
    description:
      'Where the app takes the user position from: DEMO (fixed demo location) or DEVICE (device GPS)',
  })
  locationMode: LocationMode;

  @ApiProperty({
    description:
      'Whether captured card payments of this user are refunded in full right after the capture',
  })
  autoRefund: boolean;

  static fromEntity(user: User): UserResponseDto {
    return Object.assign(new UserResponseDto(), {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
      hasPassword: user.passwordHash !== null,
      paymentMode: user.paymentMode,
      locationMode: user.locationMode,
      autoRefund: user.autoRefund,
    });
  }
}
