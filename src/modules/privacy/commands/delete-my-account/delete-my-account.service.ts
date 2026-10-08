import {
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Clock } from '../../../../common/clock/clock.js';
import { PaymentMode } from '../../../../generated/prisma/enums.js';
import { PasswordService } from '../../../auth/password.service.js';
import { MailSender } from '../../../mail/mail-sender.js';
import { accountDeleted } from '../../../mail/templates/account-deleted.js';
import { PaymentGateways } from '../../../payments/payment-gateways.js';
import {
  type DeletableAccount,
  type DeletedAccount,
  PrivacyRepository,
} from '../../database/privacy.repository.port.js';
import {
  type DeletionRequestResponseDto,
  toDeletionRequestResponse,
} from '../../dto/deletion-request.response.dto.js';
import { PrivacyErrorCode, privacyError } from '../../privacy-errors.js';
import type { DeleteMyAccountRequestDto } from './delete-my-account.request.dto.js';

@Injectable()
export class DeleteMyAccountService {
  private readonly logger = new Logger(DeleteMyAccountService.name);

  constructor(
    private readonly repository: PrivacyRepository,
    private readonly passwords: PasswordService,
    private readonly mail: MailSender,
    private readonly gateways: PaymentGateways,
    private readonly clock: Clock,
  ) {}

  async execute(
    userId: string,
    dto: DeleteMyAccountRequestDto,
  ): Promise<DeletionRequestResponseDto> {
    const account = await this.repository.findDeletableAccount(userId);
    if (!account) {
      throw new UnauthorizedException();
    }
    await this.checkPassword(account, dto.password);
    const soleManaged =
      await this.repository.findOrganizationsManagedOnlyBy(userId);
    if (soleManaged.length > 0) {
      throw privacyError(
        HttpStatus.CONFLICT,
        PrivacyErrorCode.LAST_MANAGER,
        `You are the only manager of ${soleManaged.join(', ')}; add another manager before deleting the account`,
      );
    }

    const now = this.clock.now();
    await this.sendConfirmation(account, now);
    const deleted = await this.repository.deleteAccount(userId, now);
    await this.deleteStripeCustomers(deleted);
    this.logger.log(`Deleted the account of user ${userId}`);
    return toDeletionRequestResponse(deleted.deletionRequest);
  }

  private async checkPassword(
    account: DeletableAccount,
    password: string | undefined,
  ): Promise<void> {
    if (account.passwordHash === null) {
      return;
    }
    const valid =
      password !== undefined &&
      (await this.passwords.verify(account.passwordHash, password));
    if (!valid) {
      throw privacyError(
        HttpStatus.BAD_REQUEST,
        PrivacyErrorCode.INVALID_PASSWORD,
        'The password is missing or incorrect',
      );
    }
  }

  private async sendConfirmation(
    account: DeletableAccount,
    deletedAt: Date,
  ): Promise<void> {
    try {
      await this.mail.send({
        to: account.email,
        ...accountDeleted({ name: account.name, deletedAt }),
      });
    } catch (error) {
      this.logger.error(
        'Failed to send account deleted email',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async deleteStripeCustomers(deleted: DeletedAccount): Promise<void> {
    for (const mode of Object.values(PaymentMode)) {
      const customerId = deleted.stripeCustomers[mode];
      if (!customerId) {
        continue;
      }
      try {
        await this.gateways.for(mode).deleteCustomer(customerId);
      } catch (error) {
        this.logger.warn(
          `Could not delete the ${mode} Stripe customer ${customerId}: ${String(error)}`,
        );
      }
    }
  }
}
