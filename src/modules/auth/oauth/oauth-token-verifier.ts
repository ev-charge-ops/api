import type { IdentityProvider } from '../../../generated/prisma/enums.js';

export interface VerifiedOAuthIdentity {
  provider: IdentityProvider;
  subject: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
}

export class InvalidOAuthTokenError extends Error {
  override readonly name = 'InvalidOAuthTokenError';
}

export abstract class OAuthTokenVerifier {
  abstract verify(
    provider: IdentityProvider,
    token: string,
  ): Promise<VerifiedOAuthIdentity>;
}
