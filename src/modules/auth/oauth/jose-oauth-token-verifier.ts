import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  createRemoteJWKSet,
  errors,
  type JWTPayload,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';
import type { Env } from '../../../config/env.schema.js';
import type { IdentityProvider } from '../../../generated/prisma/enums.js';
import {
  InvalidOAuthTokenError,
  OAuthTokenVerifier,
  type VerifiedOAuthIdentity,
} from './oauth-token-verifier.js';

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_ISSUERS = [
  'accounts.google.com',
  'https://accounts.google.com',
];
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
export const APPLE_ISSUERS = ['https://appleid.apple.com'];

const ALLOWED_ALGORITHMS = ['RS256'];
const CLOCK_TOLERANCE_SECONDS = 30;

export interface OAuthProviderSettings {
  keys: JWTVerifyGetKey;
  issuers: string[];
  audiences: string[];
  requireEmail: boolean;
}

export type OAuthProviderSettingsMap = Record<
  IdentityProvider,
  OAuthProviderSettings
>;

export class JoseOAuthTokenVerifier extends OAuthTokenVerifier {
  private readonly logger = new Logger(JoseOAuthTokenVerifier.name);

  constructor(private readonly providers: OAuthProviderSettingsMap) {
    super();
  }

  async verify(
    provider: IdentityProvider,
    token: string,
  ): Promise<VerifiedOAuthIdentity> {
    const settings = this.providers[provider];
    if (settings.audiences.length === 0) {
      throw new InvalidOAuthTokenError(`${provider} sign-in is not configured`);
    }

    const payload = await this.verifySignature(token, settings);
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new InvalidOAuthTokenError('Identity token has no subject');
    }

    const email = readString(payload.email)?.trim().toLowerCase();
    const emailVerified =
      payload.email_verified === true || payload.email_verified === 'true';
    if (email ? !emailVerified : settings.requireEmail) {
      throw new InvalidOAuthTokenError('Email not verified by the provider');
    }

    return {
      provider,
      subject: payload.sub,
      email,
      emailVerified: email !== undefined && emailVerified,
      name: readName(payload),
    };
  }

  private async verifySignature(
    token: string,
    settings: OAuthProviderSettings,
  ): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, settings.keys, {
        issuer: settings.issuers,
        audience: settings.audiences,
        algorithms: ALLOWED_ALGORITHMS,
        requiredClaims: ['sub', 'exp', 'iat'],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
      });
      return payload;
    } catch (error) {
      if (error instanceof errors.JOSEError) {
        this.logger.warn(`Identity token rejected: ${describeJoseError(error)}`);
        throw new InvalidOAuthTokenError('Invalid identity token');
      }
      throw error;
    }
  }
}

export function createOAuthTokenVerifier(
  config: ConfigService<Env, true>,
): OAuthTokenVerifier {
  return new JoseOAuthTokenVerifier({
    GOOGLE: {
      keys: createRemoteJWKSet(new URL(GOOGLE_JWKS_URL)),
      issuers: GOOGLE_ISSUERS,
      audiences: config.get('GOOGLE_CLIENT_IDS', { infer: true }),
      requireEmail: true,
    },
    APPLE: {
      keys: createRemoteJWKSet(new URL(APPLE_JWKS_URL)),
      issuers: APPLE_ISSUERS,
      audiences: config.get('APPLE_CLIENT_IDS', { infer: true }),
      requireEmail: false,
    },
  });
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function readName(payload: JWTPayload): string | undefined {
  const fullName = readString(payload.name);
  if (fullName) {
    return fullName.trim();
  }
  const parts = [
    readString(payload.given_name),
    readString(payload.family_name),
  ]
    .filter((part): part is string => part !== undefined)
    .map((part) => part.trim());
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function describeJoseError(error: errors.JOSEError): string {
  if (error instanceof errors.JWTClaimValidationFailed) {
    return `${error.code} (${error.claim})`;
  }
  return error.code;
}
