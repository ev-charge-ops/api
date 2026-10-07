import { ApiProperty } from '@nestjs/swagger';
import type { Invite, Organization } from '../../../generated/prisma/client.js';
import { InviteStatus, inviteStatus } from '../invite-status.js';

export class InvitePreviewDto {
  @ApiProperty({ example: 'Residencial Aclimação' })
  organizationName: string;

  @ApiProperty({ format: 'email', example: 'ana@example.com' })
  email: string;

  @ApiProperty({ type: String, nullable: true, example: 'B · 42' })
  unitLabel: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt: Date;

  @ApiProperty({ enum: InviteStatus, enumName: 'InviteStatus' })
  status: InviteStatus;

  static fromEntity(
    invite: Invite & { organization: Organization },
  ): InvitePreviewDto {
    return Object.assign(new InvitePreviewDto(), {
      organizationName: invite.organization.name,
      email: invite.email,
      unitLabel: invite.unitLabel,
      expiresAt: invite.expiresAt,
      status: inviteStatus(invite),
    });
  }
}
