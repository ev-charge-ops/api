import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ClockModule } from './common/clock/clock.module.js';
import { RateLimitModule } from './common/rate-limit/rate-limit.module.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ChargePointsModule } from './modules/charge-points/charge-points.module.js';
import { ChargingSessionsModule } from './modules/charging-sessions/charging-sessions.module.js';
import { CostSharingModule } from './modules/cost-sharing/cost-sharing.module.js';
import { InvitesModule } from './modules/invites/invites.module.js';
import { MailModule } from './modules/mail/mail.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { PrivacyModule } from './modules/privacy/privacy.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    ClockModule,
    RateLimitModule,
    DatabaseModule,
    MailModule,
    NotificationsModule,
    UsersModule,
    AuthModule,
    OrganizationsModule,
    InvitesModule,
    ChargePointsModule,
    ChargingSessionsModule,
    CostSharingModule,
    PrivacyModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule {}
