import { ApiProperty } from '@nestjs/swagger';
import {
  ChargePointType,
  ChargingSessionStatus,
  ConsentPurpose,
  IdentityProvider,
  MembershipRole,
  OrganizationType,
  PaymentStatus,
  Role,
} from '../../../../generated/prisma/enums.js';
import { DeletionRequestResponseDto } from '../../dto/deletion-request.response.dto.js';

export class ExportedIdentityDto {
  @ApiProperty({ enum: IdentityProvider, enumName: 'IdentityProvider' })
  provider: IdentityProvider;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class ExportedProfileDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Ana Souza' })
  name: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role: Role;

  @ApiProperty({ type: Date, nullable: true })
  emailVerifiedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: [ExportedIdentityDto] })
  identities: ExportedIdentityDto[];
}

export class ExportedOrganizationDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: OrganizationType, enumName: 'OrganizationType' })
  type: OrganizationType;
}

export class ExportedMembershipDto {
  @ApiProperty({ type: ExportedOrganizationDto })
  organization: ExportedOrganizationDto;

  @ApiProperty({ enum: MembershipRole, enumName: 'MembershipRole' })
  role: MembershipRole;

  @ApiProperty({ type: String, nullable: true })
  unitLabel: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class ExportedChargePointDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;
}

export class ExportedPaymentDto {
  @ApiProperty({ enum: PaymentStatus, enumName: 'PaymentStatus' })
  status: PaymentStatus;

  @ApiProperty()
  authorizedCents: number;

  @ApiProperty({ type: Number, nullable: true })
  capturedCents: number | null;

  @ApiProperty({ example: 'BRL' })
  currency: string;
}

export class ExportedSessionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: ExportedChargePointDto })
  chargePoint: ExportedChargePointDto;

  @ApiProperty({ format: 'uuid' })
  organizationId: string;

  @ApiProperty({ type: String, nullable: true })
  unitLabel: string | null;

  @ApiProperty({ enum: ChargePointType, enumName: 'ChargePointType' })
  regime: ChargePointType;

  @ApiProperty({
    enum: ChargingSessionStatus,
    enumName: 'ChargingSessionStatus',
  })
  status: ChargingSessionStatus;

  @ApiProperty()
  startedAt: Date;

  @ApiProperty({ type: Date, nullable: true })
  chargingEndedAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  endedAt: Date | null;

  @ApiProperty()
  energyKwh: number;

  @ApiProperty()
  lockedRateCents: number;

  @ApiProperty()
  energyCostCents: number;

  @ApiProperty()
  idleMinutes: number;

  @ApiProperty()
  idleFeeCents: number;

  @ApiProperty()
  totalCents: number;

  @ApiProperty({ type: ExportedPaymentDto, nullable: true })
  payment: ExportedPaymentDto | null;
}

export class ExportedConsentDto {
  @ApiProperty({ enum: ConsentPurpose, enumName: 'ConsentPurpose' })
  purpose: ConsentPurpose;

  @ApiProperty()
  granted: boolean;

  @ApiProperty({ example: '2026-10-07' })
  termsVersion: string;

  @ApiProperty()
  recordedAt: Date;
}

export class MyDataExportResponseDto {
  @ApiProperty()
  exportedAt: Date;

  @ApiProperty({ type: ExportedProfileDto })
  profile: ExportedProfileDto;

  @ApiProperty({ type: [ExportedMembershipDto] })
  memberships: ExportedMembershipDto[];

  @ApiProperty({ type: [ExportedSessionDto], description: 'Newest first' })
  sessions: ExportedSessionDto[];

  @ApiProperty({
    type: [ExportedConsentDto],
    description: 'Full consent history, oldest first',
  })
  consents: ExportedConsentDto[];

  @ApiProperty({ type: [DeletionRequestResponseDto] })
  deletionRequests: DeletionRequestResponseDto[];
}
