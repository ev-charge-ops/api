import { ApiProperty } from '@nestjs/swagger';
import type { Invite } from '../../../generated/prisma/client.js';
import { MembershipRole } from '../../../generated/prisma/enums.js';
import { InviteStatus, inviteStatus } from '../invite-status.js';

export class InviteResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'email', example: 'ana@example.com' })
  email: string;

  @ApiProperty({ type: String, nullable: true, example: 'B · 42' })
  unitLabel: string | null;

  @ApiProperty({ enum: MembershipRole, enumName: 'MembershipRole' })
  role: MembershipRole;

  @ApiProperty({ enum: InviteStatus, enumName: 'InviteStatus' })
  status: InviteStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  acceptedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  static fromEntity(invite: Invite, now?: Date): InviteResponseDto {
    return Object.assign(new InviteResponseDto(), {
      id: invite.id,
      email: invite.email,
      unitLabel: invite.unitLabel,
      role: invite.role,
      status: inviteStatus(invite, now),
      expiresAt: invite.expiresAt,
      acceptedAt: invite.acceptedAt,
      createdAt: invite.createdAt,
    });
  }
}
