import { Module } from '@nestjs/common';
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
  controllers: [
    GetMyConsentsController,
    UpdateMyConsentsController,
    ExportMyDataController,
    RequestAccountDeletionController,
  ],
  providers: [
    { provide: PrivacyRepository, useClass: PrivacyPrismaRepository },
    GetMyConsentsService,
    UpdateMyConsentsService,
    ExportMyDataService,
    RequestAccountDeletionService,
  ],
})
export class PrivacyModule {}
