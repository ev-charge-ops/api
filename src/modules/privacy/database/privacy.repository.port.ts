import type {
  ChargePointType,
  ChargingSessionStatus,
  DeletionRequestStatus,
  IdentityProvider,
  MembershipRole,
  OrganizationType,
  PaymentMode,
  PaymentStatus,
  Role,
} from '../../../generated/prisma/enums.js';
import type {
  ConsentChoice,
  ConsentEntry,
} from '../domain/consent-purposes.js';

export interface DeletionRequestRecord {
  id: string;
  status: DeletionRequestStatus;
  reason: string | null;
  createdAt: Date;
  processedAt: Date | null;
}

export interface ExportedProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  identities: {
    provider: IdentityProvider;
    email: string | null;
    createdAt: Date;
  }[];
}

export interface ExportedMembership {
  organization: { id: string; name: string; type: OrganizationType };
  role: MembershipRole;
  unitLabel: string | null;
  createdAt: Date;
}

export interface ExportedSession {
  id: string;
  chargePoint: { id: string; code: string; name: string };
  organizationId: string;
  unitLabel: string | null;
  regime: ChargePointType;
  status: ChargingSessionStatus;
  startedAt: Date;
  chargingEndedAt: Date | null;
  endedAt: Date | null;
  energyKwh: number;
  lockedRateCents: number;
  energyCostCents: number;
  idleMinutes: number;
  idleFeeCents: number;
  totalCents: number;
  payment: {
    status: PaymentStatus;
    authorizedCents: number;
    capturedCents: number | null;
    currency: string;
  } | null;
}

export interface DeletableAccount {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
}

export interface DeletedAccount {
  deletionRequest: DeletionRequestRecord;
  stripeCustomers: Record<PaymentMode, string | null>;
}

export interface UserDataExport {
  profile: ExportedProfile;
  memberships: ExportedMembership[];
  sessions: ExportedSession[];
  consents: ConsentEntry[];
  deletionRequests: DeletionRequestRecord[];
}

export abstract class PrivacyRepository {
  abstract findConsents(userId: string): Promise<ConsentEntry[]>;

  abstract recordConsents(
    userId: string,
    choices: ConsentChoice[],
    termsVersion: string,
    at: Date,
  ): Promise<void>;

  abstract findUserData(userId: string): Promise<UserDataExport | null>;

  abstract requestDeletion(
    userId: string,
    reason: string | null,
    at: Date,
  ): Promise<DeletionRequestRecord>;

  abstract findDeletableAccount(
    userId: string,
  ): Promise<DeletableAccount | null>;

  abstract findOrganizationsManagedOnlyBy(userId: string): Promise<string[]>;

  abstract deleteAccount(userId: string, at: Date): Promise<DeletedAccount>;
}
