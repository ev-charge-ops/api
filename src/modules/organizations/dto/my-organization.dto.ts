import { ApiProperty } from '@nestjs/swagger';
import type {
  Membership,
  Organization,
} from '../../../generated/prisma/client.js';
import {
  MembershipRole,
  OrganizationType,
} from '../../../generated/prisma/enums.js';

export class MyOrganizationDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Residencial Aclimação' })
  name: string;

  @ApiProperty({ enum: OrganizationType, enumName: 'OrganizationType' })
  type: OrganizationType;

  @ApiProperty({
    enum: MembershipRole,
    enumName: 'MembershipRole',
    description: 'Role of the authenticated user in the organization',
  })
  role: MembershipRole;

  @ApiProperty({ type: String, nullable: true, example: 'B · 42' })
  unitLabel: string | null;

  static fromMembership(
    membership: Membership & { organization: Organization },
  ): MyOrganizationDto {
    return Object.assign(new MyOrganizationDto(), {
      id: membership.organization.id,
      name: membership.organization.name,
      type: membership.organization.type,
      role: membership.role,
      unitLabel: membership.unitLabel,
    });
  }
}
