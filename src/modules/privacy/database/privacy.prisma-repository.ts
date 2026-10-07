import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import type {
  ConsentChoice,
  ConsentEntry,
} from '../domain/consent-purposes.js';
import {
  type DeletionRequestRecord,
  PrivacyRepository,
  type UserDataExport,
} from './privacy.repository.port.js';

const DELETION_REQUEST_SELECT = {
  id: true,
  status: true,
  reason: true,
  createdAt: true,
  processedAt: true,
} as const;

@Injectable()
export class PrivacyPrismaRepository extends PrivacyRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findConsents(userId: string): Promise<ConsentEntry[]> {
    const records = await this.prisma.consentRecord.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return records.map((record) => ({
      purpose: record.purpose,
      granted: record.granted,
      termsVersion: record.termsVersion,
      recordedAt: record.createdAt,
    }));
  }

  async recordConsents(
    userId: string,
    choices: ConsentChoice[],
    termsVersion: string,
    at: Date,
  ): Promise<void> {
    if (choices.length === 0) {
      return;
    }
    await this.prisma.consentRecord.createMany({
      data: choices.map((choice) => ({
        userId,
        purpose: choice.purpose,
        granted: choice.granted,
        termsVersion,
        createdAt: at,
      })),
    });
  }

  async findUserData(userId: string): Promise<UserDataExport | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        identities: {
          select: { provider: true, email: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
        memberships: {
          include: {
            organization: { select: { id: true, name: true, type: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        sessions: {
          include: {
            chargePoint: { select: { id: true, code: true, name: true } },
            payment: {
              select: {
                status: true,
                authorizedCents: true,
                capturedCents: true,
                currency: true,
              },
            },
          },
          orderBy: { startedAt: 'desc' },
        },
        deletionRequests: {
          select: DELETION_REQUEST_SELECT,
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user) {
      return null;
    }
    return {
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        identities: user.identities,
      },
      memberships: user.memberships.map((membership) => ({
        organization: membership.organization,
        role: membership.role,
        unitLabel: membership.unitLabel,
        createdAt: membership.createdAt,
      })),
      sessions: user.sessions.map((session) => ({
        id: session.id,
        chargePoint: session.chargePoint,
        organizationId: session.organizationId,
        unitLabel: session.unitLabel,
        regime: session.regime,
        status: session.status,
        startedAt: session.startedAt,
        chargingEndedAt: session.chargingEndedAt,
        endedAt: session.endedAt,
        energyKwh: session.energyKwh.toNumber(),
        lockedRateCents: session.lockedRateCents,
        energyCostCents: session.energyCostCents,
        idleMinutes: session.idleMinutes,
        idleFeeCents: session.idleFeeCents,
        totalCents: session.totalCents,
        payment: session.payment,
      })),
      consents: await this.findConsents(userId),
      deletionRequests: user.deletionRequests,
    };
  }

  requestDeletion(
    userId: string,
    reason: string | null,
    at: Date,
  ): Promise<DeletionRequestRecord> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const pending = await tx.deletionRequest.findFirst({
        where: { userId, status: 'PENDING' },
        select: DELETION_REQUEST_SELECT,
      });
      if (pending) {
        return pending;
      }
      return tx.deletionRequest.create({
        data: { userId, reason, createdAt: at },
        select: DELETION_REQUEST_SELECT,
      });
    });
  }
}
