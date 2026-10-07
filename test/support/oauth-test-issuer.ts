import { randomUUID } from 'node:crypto';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  type JWTVerifyGetKey,
  SignJWT,
} from 'jose';

type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

export interface SignOptions {
  issuer: string;
  audience: string;
  subject?: string;
  expiresIn?: string | number;
}

export class OAuthTestIssuer {
  private constructor(
    private readonly privateKey: SigningKey,
    private readonly keyId: string,
    readonly keys: JWTVerifyGetKey,
  ) {}

  static async create(): Promise<OAuthTestIssuer> {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const keyId = randomUUID();
    const jwk = {
      ...(await exportJWK(publicKey)),
      kid: keyId,
      alg: 'RS256',
      use: 'sig',
    };
    return new OAuthTestIssuer(
      privateKey,
      keyId,
      createLocalJWKSet({ keys: [jwk] }),
    );
  }

  sign(claims: JWTPayload, options: SignOptions): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: this.keyId })
      .setIssuer(options.issuer)
      .setAudience(options.audience)
      .setSubject(options.subject ?? randomUUID())
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? '5m')
      .sign(this.privateKey);
  }
}
