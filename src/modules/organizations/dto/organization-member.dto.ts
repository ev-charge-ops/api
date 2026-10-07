import { ApiProperty } from '@nestjs/swagger';
import type { Membership, User } from '../../../generated/prisma/client.js';
import { MembershipRole } from '../../../generated/prisma/enums.js';

export class OrganizationMemberDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ example: 'Ana Souza' })
  name: string;

  @ApiProperty({ format: 'email', example: 'ana@example.com' })
  email: string;

  @ApiProperty({ enum: MembershipRole, enumName: 'MembershipRole' })
  role: MembershipRole;

  @ApiProperty({ type: String, nullable: true, example: 'B · 42' })
  unitLabel: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  joinedAt: Date;

  static fromMembership(
    membership: Membership & { user: User },
  ): OrganizationMemberDto {
    return Object.assign(new OrganizationMemberDto(), {
      userId: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
      unitLabel: membership.unitLabel,
      joinedAt: membership.createdAt,
    });
  }
}
