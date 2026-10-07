import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { FetchGoogleAuthCodeExchanger } from './../src/modules/auth/oauth/fetch-google-auth-code-exchanger.js';
import { GoogleAuthCodeExchanger } from './../src/modules/auth/oauth/google-auth-code-exchanger.js';
import {
  APPLE_ISSUERS,
  GOOGLE_ISSUERS,
  JoseOAuthTokenVerifier,
} from './../src/modules/auth/oauth/jose-oauth-token-verifier.js';
import { OAuthTokenVerifier } from './../src/modules/auth/oauth/oauth-token-verifier.js';
import { OAuthTestIssuer } from './support/oauth-test-issuer.js';

vi.hoisted(() => {
  process.env.AUTH_THROTTLE_LIMIT = '100';
});

const GOOGLE_CLIENT_ID = 'e2e-web.apps.googleusercontent.com';
const APPLE_CLIENT_ID = 'io.softmoon.evchargeops';
const GOOGLE_CLIENT_SECRET = 'e2e-client-secret';

class FakeGoogleTokenEndpoint {
  readonly idTokens = new Map<string, string>();
  readonly requests: Record<string, string>[] = [];

  readonly fetch: typeof fetch = (_input, init) => {
    const form = Object.fromEntries(init?.body as URLSearchParams);
    this.requests.push(form);
    const idToken = this.idTokens.get(form.code);
    return Promise.resolve(
      idToken
        ? Response.json({ access_token: 'access', id_token: idToken })
        : Response.json({ error: 'invalid_grant' }, { status: 400 }),
    );
  };
}

describe('OAuth login (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let issuer: OAuthTestIssuer;
  const tokenEndpoint = new FakeGoogleTokenEndpoint();
  const run = randomUUID();
  const emails: string[] = [];

  function newEmail(prefix: string): string {
    const email = `${prefix}-${run}@example.com`;
    emails.push(email);
    return email;
  }

  function googleToken(
    claims: Record<string, unknown>,
    options: { subject?: string; audience?: string } = {},
  ): Promise<string> {
    return issuer.sign(claims, {
      issuer: 'https://accounts.google.com',
      audience: options.audience ?? GOOGLE_CLIENT_ID,
      subject: options.subject ?? randomUUID(),
    });
  }

  function loginWithGoogle(idToken: string) {
    return request(app.getHttpServer())
      .post('/auth/oauth/google')
      .send({ idToken });
  }

  beforeAll(async () => {
    issuer = await OAuthTestIssuer.create();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OAuthTokenVerifier)
      .useValue(
        new JoseOAuthTokenVerifier({
          GOOGLE: {
            keys: issuer.keys,
            issuers: GOOGLE_ISSUERS,
            audiences: [GOOGLE_CLIENT_ID],
            requireEmail: true,
          },
          APPLE: {
            keys: issuer.keys,
            issuers: APPLE_ISSUERS,
            audiences: [APPLE_CLIENT_ID],
            requireEmail: false,
          },
        }),
      )
      .overrideProvider(GoogleAuthCodeExchanger)
      .useValue(
        new FetchGoogleAuthCodeExchanger({
          clientId: GOOGLE_CLIENT_ID,
          clientSecret: GOOGLE_CLIENT_SECRET,
          fetch: tokenEndpoint.fetch,
        }),
      )
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('creates a driver on the first Google login and reuses it afterwards', async () => {
    const email = newEmail('google-new');
    const subject = randomUUID();
    const claims = {
      email: email.toUpperCase(),
      email_verified: true,
      name: 'Gabi Google',
    };

    const first = await loginWithGoogle(
      await googleToken(claims, { subject }),
    ).expect(200);
    expect(first.body.user).toMatchObject({
      name: 'Gabi Google',
      email,
      role: 'DRIVER',
      emailVerified: true,
    });
    expect(first.body.accessToken).toEqual(expect.any(String));
    expect(first.body.refreshToken).toEqual(expect.any(String));

    const second = await loginWithGoogle(
      await googleToken(claims, { subject }),
    ).expect(200);
    expect(second.body.user.id).toBe(first.body.user.id);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { identities: true },
    });
    expect(stored.passwordHash).toBeNull();
    expect(stored.identities).toEqual([
      expect.objectContaining({ provider: 'GOOGLE', subject, email }),
    ]);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${second.body.accessToken}`)
      .expect(200);
  });

  it('rejects password login for a user created through OAuth', async () => {
    const email = newEmail('google-only');
    await loginWithGoogle(
      await googleToken({ email, email_verified: true }),
    ).expect(200);

    const passwordLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'any-password-123' })
      .expect(401);
    const unknownLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: newEmail('nobody'), password: 'any-password-123' })
      .expect(401);
    expect(passwordLogin.body).toEqual(unknownLogin.body);
  });

  it('links Google to an existing password account with the same email', async () => {
    const email = newEmail('google-link');
    const registered = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Lia Link', email, password: 'link-password-123' })
      .expect(201);
    expect(registered.body.user.emailVerified).toBe(false);

    const linked = await loginWithGoogle(
      await googleToken({
        email: email.toUpperCase(),
        email_verified: true,
        name: 'Other Name',
      }),
    ).expect(200);
    expect(linked.body.user).toMatchObject({
      id: registered.body.user.id,
      name: 'Lia Link',
      emailVerified: true,
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'link-password-123' })
      .expect(200);
  });

  it('rejects a Google token issued for another audience', async () => {
    const email = newEmail('google-audience');
    const response = await loginWithGoogle(
      await googleToken(
        { email, email_verified: true },
        { audience: 'someone-else.apps.googleusercontent.com' },
      ),
    ).expect(401);

    expect(response.body.message).toBe('Invalid identity token');
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it('rejects a Google token whose email is not verified', async () => {
    const email = newEmail('google-unverified');
    const response = await loginWithGoogle(
      await googleToken({ email, email_verified: false }),
    ).expect(401);

    expect(response.body.message).toBe('Email not verified by the provider');
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it('rejects malformed payloads and tokens', async () => {
    await request(app.getHttpServer())
      .post('/auth/oauth/google')
      .send({})
      .expect(400);
    await loginWithGoogle('not-a-jwt').expect(401);
    await request(app.getHttpServer())
      .post('/auth/oauth/apple')
      .send({ identityToken: 'x', fullName: { givenName: 42 } })
      .expect(400);
  });

  it('logs in with a Google authorization code like with an ID token', async () => {
    const email = newEmail('google-code');
    const subject = randomUUID();
    const claims = { email, email_verified: true, name: 'Cora Code' };
    const code = `code-${randomUUID()}`;
    tokenEndpoint.idTokens.set(code, await googleToken(claims, { subject }));

    const response = await request(app.getHttpServer())
      .post('/auth/oauth/google/code')
      .send({ code })
      .expect(200);
    expect(response.body.user).toMatchObject({
      name: 'Cora Code',
      email,
      role: 'DRIVER',
      emailVerified: true,
    });
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(tokenEndpoint.requests.at(-1)).toEqual({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: 'postmessage',
      grant_type: 'authorization_code',
    });

    const withIdToken = await loginWithGoogle(
      await googleToken(claims, { subject }),
    ).expect(200);
    expect(withIdToken.body.user.id).toBe(response.body.user.id);
  });

  it('rejects Google authorization codes that cannot be used', async () => {
    const email = newEmail('google-code-audience');
    const foreignCode = `code-${randomUUID()}`;
    tokenEndpoint.idTokens.set(
      foreignCode,
      await googleToken(
        { email, email_verified: true },
        { audience: 'someone-else.apps.googleusercontent.com' },
      ),
    );

    const unknown = await request(app.getHttpServer())
      .post('/auth/oauth/google/code')
      .send({ code: 'bogus-code' })
      .expect(401);
    expect(unknown.body.message).toBe('Invalid authorization code');
    await request(app.getHttpServer())
      .post('/auth/oauth/google/code')
      .send({ code: foreignCode })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/oauth/google/code')
      .send({})
      .expect(400);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it('creates an Apple user with a private relay email and the shared name', async () => {
    const email = newEmail('apple').replace(
      '@example.com',
      '@privaterelay.appleid.com',
    );
    emails.push(email);
    const subject = randomUUID();
    const identityToken = await issuer.sign(
      { email, email_verified: 'true', is_private_email: 'true' },
      {
        issuer: 'https://appleid.apple.com',
        audience: APPLE_CLIENT_ID,
        subject,
      },
    );

    const response = await request(app.getHttpServer())
      .post('/auth/oauth/apple')
      .send({
        identityToken,
        fullName: { givenName: 'Maçã', familyName: 'Silva' },
      })
      .expect(200);
    expect(response.body.user).toMatchObject({
      name: 'Maçã Silva',
      email,
      role: 'DRIVER',
      emailVerified: true,
    });

    const withoutEmail = await issuer.sign(
      {},
      {
        issuer: 'https://appleid.apple.com',
        audience: APPLE_CLIENT_ID,
        subject,
      },
    );
    const again = await request(app.getHttpServer())
      .post('/auth/oauth/apple')
      .send({ identityToken: withoutEmail })
      .expect(200);
    expect(again.body.user.id).toBe(response.body.user.id);
  });
});

describe('Google authorization code login without configuration (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GoogleAuthCodeExchanger)
      .useValue(
        new FetchGoogleAuthCodeExchanger({ clientId: '', clientSecret: '' }),
      )
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds 503 with GOOGLE_CODE_FLOW_NOT_CONFIGURED', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/oauth/google/code')
      .send({ code: 'any-code' })
      .expect(503);
    expect(response.body).toMatchObject({
      statusCode: 503,
      code: 'GOOGLE_CODE_FLOW_NOT_CONFIGURED',
    });
  });
});
