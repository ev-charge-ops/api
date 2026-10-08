import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { DeleteMyAccountController } from './commands/delete-my-account/delete-my-account.controller.js';
import { DeleteMyAccountService } from './commands/delete-my-account/delete-my-account.service.js';
import { RequestAccountDeletionController } from './commands/request-account-deletion/request-account-deletion.controller.js';
import { RequestAccountDeletionService } from './commands/request-account-deletion/request-account-deletion.service.js';
import { UpdateMyConsentsController } from './commands/update-my-consents/update-my-consents.controller.js';
import { UpdateMyConsentsService } from './commands/update-my-consents/update-my-consents.service.js';
import { PrivacyPrismaRepository } from './database/privacy.prisma-repository.js';
import { PrivacyRepository } from './database/privacy.repository.port.js';
import { ExportMyDataController } from './queries/export-my-data/export-my-data.controller.js';
import { ExportMyDataService } from './queries/export-my-data/export-my-data.service.js';
import { GetMyConsentsController } from './queries/get-my-consents/get-my-consents.controller.js';
import { GetMyConsentsService } from './queries/get-my-consents/get-my-consents.service.js';

@Module({
  imports: [AuthModule, MailModule, PaymentsModule],
  controllers: [
    GetMyConsentsController,
    UpdateMyConsentsController,
    ExportMyDataController,
    RequestAccountDeletionController,
    DeleteMyAccountController,
  ],
  providers: [
    { provide: PrivacyRepository, useClass: PrivacyPrismaRepository },
    GetMyConsentsService,
    UpdateMyConsentsService,
    ExportMyDataService,
    RequestAccountDeletionService,
    DeleteMyAccountService,
  ],
})
export class PrivacyModule {}
