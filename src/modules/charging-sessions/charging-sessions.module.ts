import { Module } from '@nestjs/common';
import { ChargePointsModule } from '../charge-points/charge-points.module.js';
import { ChargerGatewayModule } from '../charger-gateway/charger-gateway.module.js';
import { StartSessionController } from './commands/start-session/start-session.controller.js';
import { StartSessionService } from './commands/start-session/start-session.service.js';
import { StopSessionController } from './commands/stop-session/stop-session.controller.js';
import { StopSessionService } from './commands/stop-session/stop-session.service.js';
import { ChargingSessionPrismaRepository } from './database/charging-session.prisma-repository.js';
import { ChargingSessionRepository } from './database/charging-session.repository.port.js';
import { GetActiveSessionController } from './queries/get-active-session/get-active-session.controller.js';
import { GetActiveSessionService } from './queries/get-active-session/get-active-session.service.js';
import { GetSessionController } from './queries/get-session/get-session.controller.js';
import { GetSessionService } from './queries/get-session/get-session.service.js';
import { ListMySessionsController } from './queries/list-my-sessions/list-my-sessions.controller.js';
import { ListMySessionsService } from './queries/list-my-sessions/list-my-sessions.service.js';
import { SessionSynchronizer } from './session-synchronizer.js';

@Module({
  imports: [ChargePointsModule, ChargerGatewayModule],
  controllers: [
    StartSessionController,
    GetActiveSessionController,
    ListMySessionsController,
    GetSessionController,
    StopSessionController,
  ],
  providers: [
    {
      provide: ChargingSessionRepository,
      useClass: ChargingSessionPrismaRepository,
    },
    SessionSynchronizer,
    StartSessionService,
    StopSessionService,
    GetSessionService,
    GetActiveSessionService,
    ListMySessionsService,
  ],
})
export class ChargingSessionsModule {}
