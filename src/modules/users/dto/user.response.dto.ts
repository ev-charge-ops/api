import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/enums.js';
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

  static fromEntity(user: User): UserResponseDto {
    return Object.assign(new UserResponseDto(), {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
    });
  }
}
