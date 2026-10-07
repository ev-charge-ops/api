import { OAuthTestIssuer } from '../../../../test/support/oauth-test-issuer.js';
import {
  APPLE_ISSUERS,
  GOOGLE_ISSUERS,
  JoseOAuthTokenVerifier,
} from './jose-oauth-token-verifier.js';
import { InvalidOAuthTokenError } from './oauth-token-verifier.js';

const GOOGLE_CLIENT_ID = 'web.apps.googleusercontent.com';
const APPLE_CLIENT_ID = 'io.softmoon.evchargeops';

describe('JoseOAuthTokenVerifier', () => {
  let issuer: OAuthTestIssuer;
  let verifier: JoseOAuthTokenVerifier;

  function googleToken(claims: Record<string, unknown>, audience?: string) {
    return issuer.sign(claims, {
      issuer: 'https://accounts.google.com',
      audience: audience ?? GOOGLE_CLIENT_ID,
      subject: 'google-subject',
    });
  }

  function appleToken(claims: Record<string, unknown>) {
    return issuer.sign(claims, {
      issuer: 'https://appleid.apple.com',
      audience: APPLE_CLIENT_ID,
      subject: 'apple-subject',
    });
  }

  beforeAll(async () => {
    issuer = await OAuthTestIssuer.create();
  });

  beforeEach(() => {
    verifier = new JoseOAuthTokenVerifier({
      GOOGLE: {
        keys: issuer.keys,
        issuers: GOOGLE_ISSUERS,
        audiences: ['other-client', GOOGLE_CLIENT_ID],
        requireEmail: true,
      },
      APPLE: {
        keys: issuer.keys,
        issuers: APPLE_ISSUERS,
        audiences: [APPLE_CLIENT_ID],
        requireEmail: false,
      },
    });
  });

  it('returns the identity of a valid Google token', async () => {
    const token = await googleToken({
      email: 'Ana@Example.com',
      email_verified: true,
      name: 'Ana Souza',
    });

    await expect(verifier.verify('GOOGLE', token)).resolves.toEqual({
      provider: 'GOOGLE',
      subject: 'google-subject',
      email: 'ana@example.com',
      emailVerified: true,
      name: 'Ana Souza',
    });
  });

  it('accepts the issuer without scheme used by Google', async () => {
    const token = await issuer.sign(
      { email: 'ana@example.com', email_verified: true },
      { issuer: 'accounts.google.com', audience: GOOGLE_CLIENT_ID },
    );

    await expect(verifier.verify('GOOGLE', token)).resolves.toMatchObject({
      email: 'ana@example.com',
    });
  });

  it('builds the name from given and family names', async () => {
    const token = await googleToken({
      email: 'ana@example.com',
      email_verified: true,
      given_name: 'Ana',
      family_name: 'Souza',
    });

    await expect(verifier.verify('GOOGLE', token)).resolves.toMatchObject({
      name: 'Ana Souza',
    });
  });

  it('rejects a token issued for another audience', async () => {
    const token = await googleToken(
      { email: 'ana@example.com', email_verified: true },
      'someone-else.apps.googleusercontent.com',
    );

    await expect(verifier.verify('GOOGLE', token)).rejects.toBeInstanceOf(
      InvalidOAuthTokenError,
    );
  });

  it('rejects a token from an unexpected issuer', async () => {
    const token = await issuer.sign(
      { email: 'ana@example.com', email_verified: true },
      { issuer: 'https://evil.example.com', audience: GOOGLE_CLIENT_ID },
    );

    await expect(verifier.verify('GOOGLE', token)).rejects.toBeInstanceOf(
      InvalidOAuthTokenError,
    );
  });

  it('rejects a Google token for the Apple provider', async () => {
    const token = await googleToken({
      email: 'ana@example.com',
      email_verified: true,
    });

    await expect(verifier.verify('APPLE', token)).rejects.toBeInstanceOf(
      InvalidOAuthTokenError,
    );
  });

  it('rejects an expired token', async () => {
    const token = await issuer.sign(
      { email: 'ana@example.com', email_verified: true },
      {
        issuer: 'https://accounts.google.com',
        audience: GOOGLE_CLIENT_ID,
        expiresIn: Math.floor(Date.now() / 1000) - 120,
      },
    );

    await expect(verifier.verify('GOOGLE', token)).rejects.toBeInstanceOf(
      InvalidOAuthTokenError,
    );
  });

  it('rejects a token signed by an unknown key', async () => {
    const stranger = await OAuthTestIssuer.create();
    const token = await stranger.sign(
      { email: 'ana@example.com', email_verified: true },
      { issuer: 'https://accounts.google.com', audience: GOOGLE_CLIENT_ID },
    );

    await expect(verifier.verify('GOOGLE', token)).rejects.toBeInstanceOf(
      InvalidOAuthTokenError,
    );
  });

  it('rejects malformed tokens', async () => {
    await expect(verifier.verify('GOOGLE', 'not-a-jwt')).rejects.toBeInstanceOf(
      InvalidOAuthTokenError,
    );
  });

  it('rejects a Google token with an unverified email', async () => {
    const token = await googleToken({
      email: 'ana@example.com',
      email_verified: false,
    });

    await expect(verifier.verify('GOOGLE', token)).rejects.toThrow(
      'Email not verified by the provider',
    );
  });

  it('rejects a Google token without email', async () => {
    const token = await googleToken({});

    await expect(verifier.verify('GOOGLE', token)).rejects.toBeInstanceOf(
      InvalidOAuthTokenError,
    );
  });

  it('accepts Apple tokens whose email_verified claim is a string', async () => {
    const token = await appleToken({
      email: 'abc123@privaterelay.appleid.com',
      email_verified: 'true',
      is_private_email: 'true',
    });

    await expect(verifier.verify('APPLE', token)).resolves.toEqual({
      provider: 'APPLE',
      subject: 'apple-subject',
      email: 'abc123@privaterelay.appleid.com',
      emailVerified: true,
      name: undefined,
    });
  });

  it('accepts Apple tokens without email', async () => {
    const token = await appleToken({});

    await expect(verifier.verify('APPLE', token)).resolves.toMatchObject({
      subject: 'apple-subject',
      email: undefined,
      emailVerified: false,
    });
  });

  it('rejects Apple tokens with an unverified email', async () => {
    const token = await appleToken({
      email: 'ana@example.com',
      email_verified: 'false',
    });

    await expect(verifier.verify('APPLE', token)).rejects.toBeInstanceOf(
      InvalidOAuthTokenError,
    );
  });

  it('rejects every token when the provider has no client ids', async () => {
    const unconfigured = new JoseOAuthTokenVerifier({
      GOOGLE: {
        keys: issuer.keys,
        issuers: GOOGLE_ISSUERS,
        audiences: [],
        requireEmail: true,
      },
      APPLE: {
        keys: issuer.keys,
        issuers: APPLE_ISSUERS,
        audiences: [],
        requireEmail: false,
      },
    });
    const token = await googleToken({
      email: 'ana@example.com',
      email_verified: true,
    });

    await expect(unconfigured.verify('GOOGLE', token)).rejects.toThrow(
      'GOOGLE sign-in is not configured',
    );
  });
});
