import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema.js';
import {
  GoogleAuthCodeExchanger,
  GoogleCodeFlowNotConfiguredError,
  InvalidGoogleAuthCodeError,
} from './google-auth-code-exchanger.js';

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_POPUP_REDIRECT_URI = 'postmessage';
const REQUEST_TIMEOUT_MS = 10_000;

export interface GoogleAuthCodeExchangerSettings {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
}

export class FetchGoogleAuthCodeExchanger extends GoogleAuthCodeExchanger {
  private readonly fetch: typeof fetch;

  constructor(private readonly settings: GoogleAuthCodeExchangerSettings) {
    super();
    this.fetch = settings.fetch ?? globalThis.fetch;
  }

  async exchange(code: string): Promise<string> {
    const { clientId, clientSecret } = this.settings;
    if (!clientId || !clientSecret) {
      throw new GoogleCodeFlowNotConfiguredError(
        'Google authorization code flow is not configured',
      );
    }

    const response = await this.fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: GOOGLE_POPUP_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new InvalidGoogleAuthCodeError('Invalid authorization code');
    }

    const idToken = readIdToken(await response.json().catch(() => null));
    if (!idToken) {
      throw new InvalidGoogleAuthCodeError('Invalid authorization code');
    }
    return idToken;
  }
}

export function createGoogleAuthCodeExchanger(
  config: ConfigService<Env, true>,
): GoogleAuthCodeExchanger {
  return new FetchGoogleAuthCodeExchanger({
    clientId: config.get('GOOGLE_WEB_CLIENT_ID', { infer: true }),
    clientSecret: config.get('GOOGLE_CLIENT_SECRET', { infer: true }),
  });
}

function readIdToken(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('id_token' in body)) {
    return undefined;
  }
  const { id_token: idToken } = body;
  return typeof idToken === 'string' && idToken.length > 0
    ? idToken
    : undefined;
}
