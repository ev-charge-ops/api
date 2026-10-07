import {
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { Prisma, type User } from '../../../generated/prisma/client.js';
import type { IdentityProvider } from '../../../generated/prisma/enums.js';
import { AuthService } from '../auth.service.js';
import type { AuthResponseDto } from '../dto/auth.response.dto.js';
import {
  GoogleAuthCodeExchanger,
  GoogleCodeFlowNotConfiguredError,
  InvalidGoogleAuthCodeError,
} from './google-auth-code-exchanger.js';
import {
  InvalidOAuthTokenError,
  OAuthTokenVerifier,
  type VerifiedOAuthIdentity,
} from './oauth-token-verifier.js';

const MAX_NAME_LENGTH = 100;
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
export const GOOGLE_CODE_FLOW_NOT_CONFIGURED =
  'GOOGLE_CODE_FLOW_NOT_CONFIGURED';

export interface OAuthProfile {
  givenName?: string;
  familyName?: string;
}

@Injectable()
export class OAuthService {
  constructor(
    private readonly verifier: OAuthTokenVerifier,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly codeExchanger: GoogleAuthCodeExchanger,
  ) {}

  async login(
    provider: IdentityProvider,
    token: string,
    profile?: OAuthProfile,
  ): Promise<AuthResponseDto> {
    const identity = await this.verify(provider, token);
    const user = await this.resolveUser(identity, profile);
    return this.auth.createSession(user);
  }

  async loginWithGoogleCode(code: string): Promise<AuthResponseDto> {
    const idToken = await this.exchangeGoogleCode(code);
    return this.login('GOOGLE', idToken);
  }

  private async exchangeGoogleCode(code: string): Promise<string> {
    try {
      return await this.codeExchanger.exchange(code);
    } catch (error) {
      if (error instanceof GoogleCodeFlowNotConfiguredError) {
        throw new ServiceUnavailableException({
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          error: 'Service Unavailable',
          message: error.message,
          code: GOOGLE_CODE_FLOW_NOT_CONFIGURED,
        });
      }
      if (error instanceof InvalidGoogleAuthCodeError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
  }

  private async verify(
    provider: IdentityProvider,
    token: string,
  ): Promise<VerifiedOAuthIdentity> {
    try {
      return await this.verifier.verify(provider, token);
    } catch (error) {
      if (error instanceof InvalidOAuthTokenError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
  }

  private async resolveUser(
    identity: VerifiedOAuthIdentity,
    profile?: OAuthProfile,
  ): Promise<User> {
    try {
      return await this.findOrCreateUser(identity, profile);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        return this.findOrCreateUser(identity, profile);
      }
      throw error;
    }
  }

  private async findOrCreateUser(
    identity: VerifiedOAuthIdentity,
    profile?: OAuthProfile,
  ): Promise<User> {
    const linked = await this.prisma.userIdentity.findUnique({
      where: {
        provider_subject: {
          provider: identity.provider,
          subject: identity.subject,
        },
      },
      include: { user: true },
    });
    if (linked) {
      return linked.user;
    }

    const email = identity.emailVerified ? identity.email : undefined;
    if (!email) {
      throw new UnauthorizedException('Email not verified by the provider');
    }

    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (existing) {
      return this.linkIdentity(existing, identity, email);
    }

    return this.prisma.user.create({
      data: {
        name: resolveName(identity, email, profile),
        email,
        emailVerifiedAt: new Date(),
        identities: {
          create: {
            provider: identity.provider,
            subject: identity.subject,
            email,
          },
        },
      },
    });
  }

  private async linkIdentity(
    user: User,
    identity: VerifiedOAuthIdentity,
    email: string,
  ): Promise<User> {
    const [, updated] = await this.prisma.$transaction([
      this.prisma.userIdentity.create({
        data: {
          userId: user.id,
          provider: identity.provider,
          subject: identity.subject,
          email,
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
      }),
    ]);
    return updated;
  }
}

function resolveName(
  identity: VerifiedOAuthIdentity,
  email: string,
  profile?: OAuthProfile,
): string {
  const profileName = [profile?.givenName, profile?.familyName]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(' ');
  const name = profileName || identity.name || email.split('@')[0];
  return name.slice(0, MAX_NAME_LENGTH);
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  );
}
