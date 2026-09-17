import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import type { User } from '../../generated/prisma/client.js';
import { MailSender } from '../mail/mail-sender.js';
import { verifyEmail } from '../mail/templates/verify-email.js';
import { UsersService } from '../users/users.service.js';
import { buildAppLink } from './app-link.js';
import { OneTimeTokenService } from './one-time-token.service.js';

export const EMAIL_VERIFICATION_TTL_MINUTES = 24 * 60;

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly users: UsersService,
    private readonly tokens: OneTimeTokenService,
    private readonly mail: MailSender,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async sendVerificationEmail(user: User): Promise<void> {
    try {
      const { token } = await this.tokens.issue(
        user.id,
        'EMAIL_VERIFICATION',
        EMAIL_VERIFICATION_TTL_MINUTES,
      );
      const url = buildAppLink(
        this.config.get('APP_URL', { infer: true }),
        '/verify-email',
        token,
      );
      await this.mail.send({
        to: user.email,
        ...verifyEmail({
          name: user.name,
          url,
          expiresInMinutes: EMAIL_VERIFICATION_TTL_MINUTES,
        }),
      });
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to user ${user.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async confirm(token: string): Promise<void> {
    const consumed = await this.tokens.consumeByToken(
      'EMAIL_VERIFICATION',
      token,
    );
    if (!consumed) {
      throw new BadRequestException('Invalid or expired token');
    }
    await this.users.markEmailVerified(consumed.userId);
  }

  async resend(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.emailVerifiedAt) {
      return;
    }
    await this.sendVerificationEmail(user);
  }
}
