import { Module } from '@nestjs/common';
import { IntelligenceModule } from '../intelligence/intelligence.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { ChargePointsController } from './charge-points.controller.js';
import { ChargePointsRepository } from './charge-points.repository.js';
import { ChargePointsService } from './charge-points.service.js';
import { OrganizationTariffController } from './organization-tariff.controller.js';
import { ChargePointQueue } from './queue/charge-point-queue.js';
import { ChargePointQueueController } from './queue/charge-point-queue.controller.js';
import { QueueRepository } from './queue/queue.repository.js';
import { TariffsService } from './tariffs.service.js';

@Module({
  imports: [IntelligenceModule, NotificationsModule, OrganizationsModule],
  controllers: [
    ChargePointsController,
    ChargePointQueueController,
    OrganizationTariffController,
  ],
  providers: [
    ChargePointsRepository,
    ChargePointsService,
    TariffsService,
    QueueRepository,
    ChargePointQueue,
  ],
  exports: [ChargePointsService, TariffsService, ChargePointQueue],
})
export class ChargePointsModule {}
