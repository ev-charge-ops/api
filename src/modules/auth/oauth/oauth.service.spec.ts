import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../../../database/prisma.service.js';
import type { User, UserIdentity } from '../../../generated/prisma/client.js';
import type { IdentityProvider } from '../../../generated/prisma/enums.js';
import type { AuthService } from '../auth.service.js';
import { OAuthService } from './oauth.service.js';
import {
  InvalidOAuthTokenError,
  OAuthTokenVerifier,
  type VerifiedOAuthIdentity,
} from './oauth-token-verifier.js';

class FakeVerifier extends OAuthTokenVerifier {
  readonly identities = new Map<string, VerifiedOAuthIdentity>();

  verify(
    provider: IdentityProvider,
    token: string,
  ): Promise<VerifiedOAuthIdentity> {
    const identity = this.identities.get(token);
    if (!identity || identity.provider !== provider) {
      return Promise.reject(new InvalidOAuthTokenError('Invalid token'));
    }
    return Promise.resolve(identity);
  }
}

interface NewUser {
  name: string;
  email: string;
  emailVerifiedAt: Date;
  identities: {
    create: Pick<UserIdentity, 'provider' | 'subject' | 'email'>;
  };
}

function createInMemoryPrisma() {
  const users: User[] = [];
  const identities: UserIdentity[] = [];

  function addIdentity(
    data: Pick<UserIdentity, 'userId' | 'provider' | 'subject' | 'email'>,
  ): UserIdentity {
    const identity: UserIdentity = {
      id: randomUUID(),
      createdAt: new Date(),
      ...data,
    };
    identities.push(identity);
    return identity;
  }

  return {
    users,
    identities,
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
    userIdentity: {
      findUnique: ({
        where,
      }: {
        where: {
          provider_subject: { provider: IdentityProvider; subject: string };
        };
      }) => {
        const found = identities.find(
          (identity) =>
            identity.provider === where.provider_subject.provider &&
            identity.subject === where.provider_subject.subject,
        );
        return Promise.resolve(
          found
            ? { ...found, user: users.find((user) => user.id === found.userId) }
            : null,
        );
      },
      create: ({
        data,
      }: {
        data: Pick<UserIdentity, 'userId' | 'provider' | 'subject' | 'email'>;
      }) => Promise.resolve(addIdentity(data)),
    },
    user: {
      findFirst: ({ where }: { where: { email: { equals: string } } }) =>
        Promise.resolve(
          users.find(
            (user) =>
              user.email.toLowerCase() === where.email.equals.toLowerCase(),
          ) ?? null,
        ),
      create: ({ data }: { data: NewUser }) => {
        const { identities: nested, ...fields } = data;
        const user: User = {
          id: randomUUID(),
          passwordHash: null,
          role: 'DRIVER',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...fields,
        };
        users.push(user);
        addIdentity({ ...nested.create, userId: user.id });
        return Promise.resolve(user);
      },
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<User>;
      }) => {
        const user = users.find((candidate) => candidate.id === where.id);
        if (!user) {
          return Promise.reject(new Error('User not found'));
        }
        Object.assign(user, data);
        return Promise.resolve(user);
      },
    },
  };
}

describe('OAuthService', () => {
  let prisma: ReturnType<typeof createInMemoryPrisma>;
  let verifier: FakeVerifier;
  let createSession: ReturnType<typeof vi.fn>;
  let service: OAuthService;

  function googleIdentity(
    overrides: Partial<VerifiedOAuthIdentity> = {},
  ): VerifiedOAuthIdentity {
    return {
      provider: 'GOOGLE',
      subject: 'google-123',
      email: 'ana@example.com',
      emailVerified: true,
      name: 'Ana Souza',
      ...overrides,
    };
  }

  function existingUser(overrides: Partial<User> = {}): User {
    const user: User = {
      id: randomUUID(),
      name: 'Existing',
      email: 'ana@example.com',
      passwordHash: '$argon2id$hash',
      role: 'MANAGER',
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    prisma.users.push(user);
    return user;
  }

  beforeEach(() => {
    prisma = createInMemoryPrisma();
    verifier = new FakeVerifier();
    createSession = vi.fn((user: User) =>
      Promise.resolve({ user, accessToken: 'access', refreshToken: 'refresh' }),
    );
    service = new OAuthService(
      verifier,
      prisma as unknown as PrismaService,
      { createSession } as unknown as AuthService,
    );
  });

  it('maps an invalid token to 401', async () => {
    await expect(service.login('GOOGLE', 'bogus')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(createSession).not.toHaveBeenCalled();
  });

  it('creates a verified driver without password for a new email', async () => {
    verifier.identities.set('token', googleIdentity());

    await service.login('GOOGLE', 'token');

    expect(prisma.users).toHaveLength(1);
    const [user] = prisma.users;
    expect(user).toMatchObject({
      name: 'Ana Souza',
      email: 'ana@example.com',
      role: 'DRIVER',
      passwordHash: null,
    });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(prisma.identities).toEqual([
      expect.objectContaining({
        userId: user.id,
        provider: 'GOOGLE',
        subject: 'google-123',
        email: 'ana@example.com',
      }),
    ]);
    expect(createSession).toHaveBeenCalledWith(user);
  });

  it('prefers the name sent by the client', async () => {
    verifier.identities.set(
      'token',
      googleIdentity({ provider: 'APPLE', name: undefined }),
    );

    await service.login('APPLE', 'token', {
      givenName: ' Ana ',
      familyName: 'Souza',
    });

    expect(prisma.users[0].name).toBe('Ana Souza');
  });

  it('falls back to the email local part as name', async () => {
    verifier.identities.set(
      'token',
      googleIdentity({
        provider: 'APPLE',
        email: 'x1y2@privaterelay.appleid.com',
        name: undefined,
      }),
    );

    await service.login('APPLE', 'token', {});

    expect(prisma.users[0].name).toBe('x1y2');
  });

  it('links the identity to an existing user with the same email', async () => {
    const user = existingUser({ email: 'Ana@Example.com' });
    verifier.identities.set('token', googleIdentity());

    await service.login('GOOGLE', 'token');

    expect(prisma.users).toHaveLength(1);
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(user.role).toBe('MANAGER');
    expect(prisma.identities).toEqual([
      expect.objectContaining({ userId: user.id, subject: 'google-123' }),
    ]);
    expect(createSession).toHaveBeenCalledWith(user);
  });

  it('logs in a linked identity even when the provider omits the email', async () => {
    const user = existingUser();
    prisma.identities.push({
      id: randomUUID(),
      userId: user.id,
      provider: 'APPLE',
      subject: 'apple-1',
      email: user.email,
      createdAt: new Date(),
    });
    verifier.identities.set(
      'token',
      googleIdentity({
        provider: 'APPLE',
        subject: 'apple-1',
        email: undefined,
        emailVerified: false,
      }),
    );

    await service.login('APPLE', 'token');

    expect(createSession).toHaveBeenCalledWith(user);
    expect(prisma.identities).toHaveLength(1);
  });

  it('rejects an unknown identity without a verified email', async () => {
    verifier.identities.set(
      'token',
      googleIdentity({
        provider: 'APPLE',
        email: undefined,
        emailVerified: false,
      }),
    );

    await expect(service.login('APPLE', 'token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.users).toHaveLength(0);
  });
});
