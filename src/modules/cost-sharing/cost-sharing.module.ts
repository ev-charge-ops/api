import { Module } from '@nestjs/common';
import { ChargePointsModule } from '../charge-points/charge-points.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { CostSharingPrismaRepository } from './database/cost-sharing.prisma-repository.js';
import { CostSharingRepository } from './database/cost-sharing.repository.port.js';
import { ExportMonthlyStatementCsvController } from './queries/export-monthly-statement-csv/export-monthly-statement-csv.controller.js';
import { GetMyMonthlyStatementController } from './queries/get-my-monthly-statement/get-my-monthly-statement.controller.js';
import { GetMyMonthlyStatementService } from './queries/get-my-monthly-statement/get-my-monthly-statement.service.js';
import { GetMonthlyStatementController } from './queries/get-monthly-statement/get-monthly-statement.controller.js';
import { GetMonthlyStatementService } from './queries/get-monthly-statement/get-monthly-statement.service.js';
import { GetOrganizationOverviewController } from './queries/get-organization-overview/get-organization-overview.controller.js';
import { GetOrganizationOverviewService } from './queries/get-organization-overview/get-organization-overview.service.js';
import { ListOrganizationSessionsController } from './queries/list-organization-sessions/list-organization-sessions.controller.js';
import { ListOrganizationSessionsService } from './queries/list-organization-sessions/list-organization-sessions.service.js';

@Module({
  imports: [ChargePointsModule, OrganizationsModule],
  controllers: [
    ExportMonthlyStatementCsvController,
    GetMonthlyStatementController,
    GetMyMonthlyStatementController,
    ListOrganizationSessionsController,
    GetOrganizationOverviewController,
  ],
  providers: [
    { provide: CostSharingRepository, useClass: CostSharingPrismaRepository },
    GetMonthlyStatementService,
    GetMyMonthlyStatementService,
    ListOrganizationSessionsService,
    GetOrganizationOverviewService,
  ],
})
export class CostSharingModule {}
