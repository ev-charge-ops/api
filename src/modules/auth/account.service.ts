import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../common/clock/clock.js';
import type { Env } from '../../config/env.schema.js';
import type { User } from '../../generated/prisma/client.js';
import { MailSender } from '../mail/mail-sender.js';
import { passwordChanged } from '../mail/templates/password-changed.js';
import { UserResponseDto } from '../users/dto/user.response.dto.js';
import { UsersService } from '../users/users.service.js';
import { invalidCurrentPassword } from './account-errors.js';
import { AuthService } from './auth.service.js';
import type { AuthResponseDto } from './dto/auth.response.dto.js';
import type { ChangeMyPasswordDto } from './dto/change-my-password.dto.js';
import type { UpdateMyProfileDto } from './dto/update-my-profile.dto.js';
import { PasswordService } from './password.service.js';
import { RefreshTokenService } from './refresh-token.service.js';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly auth: AuthService,
    private readonly mail: MailSender,
    private readonly clock: Clock,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async updateProfile(
    userId: string,
    dto: UpdateMyProfileDto,
  ): Promise<UserResponseDto> {
    await this.findUser(userId);
    return UserResponseDto.fromEntity(
      await this.users.updateName(userId, dto.name),
    );
  }

  async changePassword(
    userId: string,
    dto: ChangeMyPasswordDto,
  ): Promise<AuthResponseDto> {
    const user = await this.findUser(userId);
    if (user.passwordHash !== null) {
      const valid =
        dto.currentPassword !== undefined &&
        (await this.passwords.verify(user.passwordHash, dto.currentPassword));
      if (!valid) {
        throw invalidCurrentPassword();
      }
    }

    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.users.updatePasswordHash(user.id, passwordHash);
    await this.refreshTokens.revokeAllForUser(user.id);
    const session = await this.auth.createSession({ ...user, passwordHash });
    await this.sendPasswordChangedEmail(user);
    return session;
  }

  private async findUser(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  private async sendPasswordChangedEmail(user: User): Promise<void> {
    try {
      await this.mail.send({
        to: user.email,
        ...passwordChanged({
          name: user.name,
          changedAt: this.clock.now(),
          forgotPasswordUrl: `${this.config.get('APP_URL', { infer: true })}/forgot-password`,
        }),
      });
    } catch (error) {
      this.logger.error(
        'Failed to send password changed email',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
