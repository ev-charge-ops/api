import { randomBytes } from 'node:crypto';
import {
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  type Invite,
  type Organization,
  Prisma,
  type User,
} from '../../generated/prisma/client.js';
import { buildAppLink } from '../auth/app-link.js';
import { AuthService } from '../auth/auth.service.js';
import type { AuthResponseDto } from '../auth/dto/auth.response.dto.js';
import { PasswordService } from '../auth/password.service.js';
import { hashToken } from '../auth/refresh-token.service.js';
import { MailSender } from '../mail/mail-sender.js';
import { organizationInvite } from '../mail/templates/organization-invite.js';
import { Notifier } from '../notifications/notifier.js';
import { UsersService } from '../users/users.service.js';
import type { AcceptInviteDto } from './dto/accept-invite.dto.js';
import type { CreateInviteDto } from './dto/create-invite.dto.js';
import { InvitePreviewDto } from './dto/invite-preview.dto.js';
import { InviteResponseDto } from './dto/invite.response.dto.js';
import {
  inviteError,
  InviteErrorCode,
  inviteNotFound,
  inviteUnavailable,
} from './invite-errors.js';
import { InviteStatus, inviteStatus } from './invite-status.js';

export const INVITE_TTL_DAYS = 7;

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

type InviteWithContext = Invite & {
  organization: Organization;
  invitedBy: User;
};

type PrismaTransaction = Prisma.TransactionClient;

@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly auth: AuthService,
    private readonly mail: MailSender,
    private readonly config: ConfigService<Env, true>,
    private readonly notifier: Notifier,
  ) {}

  async create(
    organizationId: string,
    invitedById: string,
    dto: CreateInviteDto,
  ): Promise<InviteResponseDto> {
    await this.ensureInvitable(organizationId, dto.email);

    const token = generateToken();
    const invite = await this.prisma.invite.create({
      data: {
        organizationId,
        email: dto.email,
        unitLabel: dto.unitLabel || null,
        tokenHash: hashToken(token),
        expiresAt: inviteExpiry(),
        invitedById,
      },
      include: { organization: true, invitedBy: true },
    });

    try {
      await this.sendInviteEmail(invite, token);
    } catch (error) {
      await this.prisma.invite.delete({ where: { id: invite.id } });
      throw error;
    }
    return InviteResponseDto.fromEntity(invite);
  }

  async list(organizationId: string): Promise<InviteResponseDto[]> {
    const invites = await this.prisma.invite.findMany({
      where: { organizationId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    return invites.map((invite) => InviteResponseDto.fromEntity(invite, now));
  }

  async resend(
    organizationId: string,
    inviteId: string,
  ): Promise<InviteResponseDto> {
    const invite = await this.findInOrganization(organizationId, inviteId);
    const status = inviteStatus(invite);
    if (status === InviteStatus.ACCEPTED || status === InviteStatus.REVOKED) {
      throw inviteUnavailable(status, HttpStatus.CONFLICT);
    }
    await this.ensureInvitable(organizationId, invite.email, invite.id);

    const token = generateToken();
    const updated = await this.prisma.invite.update({
      where: { id: invite.id },
      data: { tokenHash: hashToken(token), expiresAt: inviteExpiry() },
      include: { organization: true, invitedBy: true },
    });
    await this.sendInviteEmail(updated, token);
    return InviteResponseDto.fromEntity(updated);
  }

  async revoke(organizationId: string, inviteId: string): Promise<void> {
    const invite = await this.findInOrganization(organizationId, inviteId);
    if (invite.acceptedAt) {
      throw inviteUnavailable(InviteStatus.ACCEPTED, HttpStatus.CONFLICT);
    }
    await this.prisma.invite.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async preview(token: string): Promise<InvitePreviewDto> {
    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { organization: true },
    });
    if (!invite) {
      throw inviteNotFound();
    }
    return InvitePreviewDto.fromEntity(invite);
  }

  async acceptAsNewUser(
    token: string,
    dto: AcceptInviteDto,
  ): Promise<AuthResponseDto> {
    const invite = await this.findPending(token);
    if (await this.users.findByEmail(invite.email)) {
      throw emailAlreadyRegistered();
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.withConflictHandling(
      () =>
        this.prisma.$transaction(async (tx) => {
          await claimInvite(tx, invite.id);
          const created = await tx.user.create({
            data: {
              name: dto.name,
              email: invite.email,
              passwordHash,
              emailVerifiedAt: new Date(),
              memberships: {
                create: {
                  organizationId: invite.organizationId,
                  role: invite.role,
                  unitLabel: invite.unitLabel,
                },
              },
            },
          });
          await tx.invite.update({
            where: { id: invite.id },
            data: { acceptedById: created.id },
          });
          return created;
        }),
      emailAlreadyRegistered,
    );
    return this.auth.createSession(user);
  }

  async acceptAsUser(token: string, userId: string): Promise<void> {
    const invite = await this.findPending(token);
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.email.toLowerCase() !== invite.email) {
      throw inviteError(
        HttpStatus.FORBIDDEN,
        InviteErrorCode.INVITE_EMAIL_MISMATCH,
        'Invite was sent to a different email',
      );
    }

    await this.withConflictHandling(
      () =>
        this.prisma.$transaction(async (tx) => {
          await claimInvite(tx, invite.id, user.id);
          await tx.membership.create({
            data: {
              userId: user.id,
              organizationId: invite.organizationId,
              role: invite.role,
              unitLabel: invite.unitLabel,
            },
          });
          await tx.user.updateMany({
            where: { id: user.id, emailVerifiedAt: null },
            data: { emailVerifiedAt: new Date() },
          });
        }),
      alreadyMember,
    );
  }

  private async ensureInvitable(
    organizationId: string,
    email: string,
    exceptInviteId?: string,
  ): Promise<void> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        organizationId,
        user: { email: { equals: email, mode: 'insensitive' } },
      },
    });
    if (membership) {
      throw alreadyMember();
    }

    const pending = await this.prisma.invite.findFirst({
      where: {
        organizationId,
        email,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        ...(exceptInviteId ? { id: { not: exceptInviteId } } : {}),
      },
    });
    if (pending) {
      throw inviteError(
        HttpStatus.CONFLICT,
        InviteErrorCode.INVITE_ALREADY_PENDING,
        'There is already a pending invite for this email',
      );
    }
  }

  private async findInOrganization(
    organizationId: string,
    inviteId: string,
  ): Promise<Invite> {
    const invite = await this.prisma.invite.findFirst({
      where: { id: inviteId, organizationId },
    });
    if (!invite) {
      throw inviteNotFound();
    }
    return invite;
  }

  private async findPending(token: string): Promise<Invite> {
    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!invite) {
      throw inviteNotFound();
    }
    const status = inviteStatus(invite);
    if (status !== InviteStatus.PENDING) {
      throw inviteUnavailable(status);
    }
    return invite;
  }

  private async withConflictHandling<T>(
    work: () => Promise<T>,
    conflict: () => Error,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw conflict();
      }
      throw error;
    }
  }

  private async sendInviteEmail(
    invite: InviteWithContext,
    token: string,
  ): Promise<void> {
    await this.mail.send({
      to: invite.email,
      ...organizationInvite({
        managerName: invite.invitedBy.name,
        organizationName: invite.organization.name,
        unitLabel: invite.unitLabel,
        url: buildAppLink(
          this.config.get('APP_URL', { infer: true }),
          '/invite',
          token,
        ),
        expiresInDays: INVITE_TTL_DAYS,
      }),
    });
    await this.notifyInvitee(invite);
  }

  private async notifyInvitee(invite: InviteWithContext): Promise<void> {
    let invitee: { id: string } | null;
    try {
      invitee = await this.prisma.user.findFirst({
        where: { email: { equals: invite.email, mode: 'insensitive' } },
        select: { id: true },
      });
    } catch (error) {
      this.logger.warn(
        `Could not look up the invitee of invite ${invite.id}: ${String(error)}`,
      );
      return;
    }
    if (!invitee) {
      return;
    }
    const unit = invite.unitLabel ? ` (unidade ${invite.unitLabel})` : '';
    await this.notifier.notify({
      userId: invitee.id,
      type: 'ORGANIZATION_INVITE',
      title: `Convite de ${invite.organization.name}`,
      body: `${invite.invitedBy.name} convidou você para ${invite.organization.name}${unit}. Abra o link enviado para ${invite.email} para aceitar.`,
      data: {
        inviteId: invite.id,
        organizationId: invite.organizationId,
        organizationName: invite.organization.name,
        unitLabel: invite.unitLabel,
        expiresAt: invite.expiresAt.toISOString(),
      },
      dedupeKey: `invite:${invite.id}:${invite.expiresAt.getTime()}`,
    });
  }
}

async function claimInvite(
  tx: PrismaTransaction,
  inviteId: string,
  acceptedById?: string,
): Promise<void> {
  const now = new Date();
  const { count } = await tx.invite.updateMany({
    where: {
      id: inviteId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: { acceptedAt: now, acceptedById },
  });
  if (count === 0) {
    const current = await tx.invite.findUniqueOrThrow({
      where: { id: inviteId },
    });
    const status = inviteStatus(current, now);
    throw inviteUnavailable(
      status === InviteStatus.PENDING ? InviteStatus.ACCEPTED : status,
    );
  }
}

function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

function inviteExpiry(): Date {
  return new Date(Date.now() + INVITE_TTL_DAYS * DAY_IN_MS);
}

function alreadyMember() {
  return inviteError(
    HttpStatus.CONFLICT,
    InviteErrorCode.ALREADY_MEMBER,
    'This email already belongs to a member of the organization',
  );
}

function emailAlreadyRegistered() {
  return inviteError(
    HttpStatus.CONFLICT,
    InviteErrorCode.EMAIL_ALREADY_REGISTERED,
    'Email already registered; log in and accept the invite with your account',
  );
}
