import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { UsersModule } from '../users/users.module.js';
import { InvitesController } from './invites.controller.js';
import { InvitesService } from './invites.service.js';
import { OrganizationInvitesController } from './organization-invites.controller.js';

@Module({
  imports: [
    AuthModule,
    MailModule,
    NotificationsModule,
    OrganizationsModule,
    UsersModule,
  ],
  controllers: [OrganizationInvitesController, InvitesController],
  providers: [InvitesService],
})
export class InvitesModule {}
