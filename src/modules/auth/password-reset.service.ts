import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withMinimumDuration } from '../../common/timing/with-minimum-duration.js';
import type { Env } from '../../config/env.schema.js';
import { MailSender } from '../mail/mail-sender.js';
import { passwordReset } from '../mail/templates/password-reset.js';
import { UsersService } from '../users/users.service.js';
import { buildAppLink } from './app-link.js';
import { OneTimeTokenService } from './one-time-token.service.js';
import { PasswordService } from './password.service.js';
import { RefreshTokenService } from './refresh-token.service.js';

export const PASSWORD_RESET_TTL_MINUTES = 30;
export const FORGOT_PASSWORD_MINIMUM_DURATION_MS = 500;

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly users: UsersService,
    private readonly tokens: OneTimeTokenService,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly mail: MailSender,
    private readonly config: ConfigService<Env, true>,
  ) {}

  requestReset(email: string): Promise<void> {
    return withMinimumDuration(
      this.sendResetEmail(email),
      FORGOT_PASSWORD_MINIMUM_DURATION_MS,
    );
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const consumed = await this.tokens.consumeByToken('PASSWORD_RESET', token);
    if (!consumed) {
      throw new BadRequestException('Invalid or expired token');
    }

    await this.users.updatePasswordHash(
      consumed.userId,
      await this.passwords.hash(password),
    );
    await this.users.markEmailVerified(consumed.userId);
    await this.refreshTokens.revokeAllForUser(consumed.userId);
  }

  private async sendResetEmail(email: string): Promise<void> {
    try {
      const user = await this.users.findByEmail(email.trim().toLowerCase());
      if (!user) {
        return;
      }
      const { token } = await this.tokens.issue(
        user.id,
        'PASSWORD_RESET',
        PASSWORD_RESET_TTL_MINUTES,
      );
      await this.mail.send({
        to: user.email,
        ...passwordReset({
          name: user.name,
          url: buildAppLink(
            this.config.get('APP_URL', { infer: true }),
            '/reset-password',
            token,
          ),
          expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
        }),
      });
    } catch (error) {
      this.logger.error(
        'Failed to send password reset email',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
