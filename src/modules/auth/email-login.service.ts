import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withMinimumDuration } from '../../common/timing/with-minimum-duration.js';
import type { Env } from '../../config/env.schema.js';
import { MailSender } from '../mail/mail-sender.js';
import { emailLoginCode } from '../mail/templates/email-login-code.js';
import { UsersService } from '../users/users.service.js';
import { buildAppLink } from './app-link.js';
import { AuthService } from './auth.service.js';
import type { AuthResponseDto } from './dto/auth.response.dto.js';
import {
  type ConsumedOneTimeToken,
  OneTimeTokenService,
} from './one-time-token.service.js';

export const EMAIL_LOGIN_TTL_MINUTES = 10;
export const EMAIL_LOGIN_REQUEST_MINIMUM_DURATION_MS = 500;

const INVALID_LOGIN = 'Invalid or expired code';

export type EmailLoginCredentials =
  { token: string } | { email: string; code: string };

@Injectable()
export class EmailLoginService {
  private readonly logger = new Logger(EmailLoginService.name);

  constructor(
    private readonly users: UsersService,
    private readonly tokens: OneTimeTokenService,
    private readonly auth: AuthService,
    private readonly mail: MailSender,
    private readonly config: ConfigService<Env, true>,
  ) {}

  request(email: string): Promise<void> {
    return withMinimumDuration(
      this.sendLoginEmail(email),
      EMAIL_LOGIN_REQUEST_MINIMUM_DURATION_MS,
    );
  }

  async verify(credentials: EmailLoginCredentials): Promise<AuthResponseDto> {
    const consumed = await this.consume(credentials);
    if (!consumed) {
      throw new UnauthorizedException(INVALID_LOGIN);
    }

    await this.users.markEmailVerified(consumed.userId);
    const user = await this.users.findById(consumed.userId);
    if (!user) {
      throw new UnauthorizedException(INVALID_LOGIN);
    }
    return this.auth.createSession(user);
  }

  private async consume(
    credentials: EmailLoginCredentials,
  ): Promise<ConsumedOneTimeToken | null> {
    if ('token' in credentials) {
      return this.tokens.consumeByToken('EMAIL_LOGIN', credentials.token);
    }
    const user = await this.users.findByEmail(
      credentials.email.trim().toLowerCase(),
    );
    if (!user) {
      return null;
    }
    return this.tokens.consumeByCode('EMAIL_LOGIN', user.id, credentials.code);
  }

  private async sendLoginEmail(email: string): Promise<void> {
    try {
      const user = await this.users.findByEmail(email.trim().toLowerCase());
      if (!user) {
        return;
      }
      const { token, code } = await this.tokens.issue(
        user.id,
        'EMAIL_LOGIN',
        EMAIL_LOGIN_TTL_MINUTES,
        { withCode: true },
      );
      await this.mail.send({
        to: user.email,
        ...emailLoginCode({
          name: user.name,
          code: code ?? '',
          url: buildAppLink(
            this.config.get('APP_URL', { infer: true }),
            '/login/email',
            token,
          ),
          expiresInMinutes: EMAIL_LOGIN_TTL_MINUTES,
        }),
      });
    } catch (error) {
      this.logger.error(
        'Failed to send email login code',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
