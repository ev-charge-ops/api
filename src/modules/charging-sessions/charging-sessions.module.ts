import { Module } from '@nestjs/common';
import { ChargePointsModule } from '../charge-points/charge-points.module.js';
import { ChargerGatewayModule } from '../charger-gateway/charger-gateway.module.js';
import { IntelligenceModule } from '../intelligence/intelligence.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { ConfirmSessionPaymentController } from './commands/confirm-session-payment/confirm-session-payment.controller.js';
import { ConfirmSessionPaymentService } from './commands/confirm-session-payment/confirm-session-payment.service.js';
import { CreatePaymentSheetController } from './commands/create-payment-sheet/create-payment-sheet.controller.js';
import { CreatePaymentSheetService } from './commands/create-payment-sheet/create-payment-sheet.service.js';
import { HandleStripeWebhookController } from './commands/handle-stripe-webhook/handle-stripe-webhook.controller.js';
import { HandleStripeWebhookService } from './commands/handle-stripe-webhook/handle-stripe-webhook.service.js';
import { StartSessionController } from './commands/start-session/start-session.controller.js';
import { StartSessionService } from './commands/start-session/start-session.service.js';
import { StopSessionController } from './commands/stop-session/stop-session.controller.js';
import { StopSessionService } from './commands/stop-session/stop-session.service.js';
import { ChargingSessionPrismaRepository } from './database/charging-session.prisma-repository.js';
import { ChargingSessionRepository } from './database/charging-session.repository.port.js';
import { PaymentRecordsRepository } from './database/payment-records.repository.js';
import { GetActiveSessionController } from './queries/get-active-session/get-active-session.controller.js';
import { GetActiveSessionService } from './queries/get-active-session/get-active-session.service.js';
import { GetSessionController } from './queries/get-session/get-session.controller.js';
import { GetSessionService } from './queries/get-session/get-session.service.js';
import { ListMySessionsController } from './queries/list-my-sessions/list-my-sessions.controller.js';
import { ListMySessionsService } from './queries/list-my-sessions/list-my-sessions.service.js';
import { SessionEvents } from './session-events.js';
import { SessionPayments } from './session-payments.js';
import { SessionProjector } from './session-projector.js';
import { SessionStarter } from './session-starter.js';
import { SessionSynchronizer } from './session-synchronizer.js';

@Module({
  imports: [
    ChargePointsModule,
    ChargerGatewayModule,
    IntelligenceModule,
    NotificationsModule,
    PaymentsModule,
  ],
  controllers: [
    StartSessionController,
    GetActiveSessionController,
    ListMySessionsController,
    GetSessionController,
    StopSessionController,
    ConfirmSessionPaymentController,
    CreatePaymentSheetController,
    HandleStripeWebhookController,
  ],
  providers: [
    {
      provide: ChargingSessionRepository,
      useClass: ChargingSessionPrismaRepository,
    },
    PaymentRecordsRepository,
    SessionEvents,
    SessionStarter,
    SessionPayments,
    SessionProjector,
    SessionSynchronizer,
    StartSessionService,
    StopSessionService,
    GetSessionService,
    GetActiveSessionService,
    ListMySessionsService,
    ConfirmSessionPaymentService,
    CreatePaymentSheetService,
    HandleStripeWebhookService,
  ],
})
export class ChargingSessionsModule {}
