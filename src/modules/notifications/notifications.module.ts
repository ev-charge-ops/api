import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { MarkAllNotificationsReadController } from './commands/mark-all-notifications-read/mark-all-notifications-read.controller.js';
import { MarkAllNotificationsReadService } from './commands/mark-all-notifications-read/mark-all-notifications-read.service.js';
import { MarkNotificationReadController } from './commands/mark-notification-read/mark-notification-read.controller.js';
import { MarkNotificationReadService } from './commands/mark-notification-read/mark-notification-read.service.js';
import { RegisterPushTokenController } from './commands/register-push-token/register-push-token.controller.js';
import { RegisterPushTokenService } from './commands/register-push-token/register-push-token.service.js';
import { RemovePushTokenController } from './commands/remove-push-token/remove-push-token.controller.js';
import { RemovePushTokenService } from './commands/remove-push-token/remove-push-token.service.js';
import { NotificationsPrismaRepository } from './database/notifications.prisma-repository.js';
import { NotificationsRepository } from './database/notifications.repository.port.js';
import { Notifier } from './notifier.js';
import { ConsolePushSender } from './push/console-push-sender.js';
import { ExpoPushSender } from './push/expo-push-sender.js';
import { PushOutbox } from './push/push-outbox.js';
import { PushSender } from './push/push-sender.port.js';
import { ListMyNotificationsController } from './queries/list-my-notifications/list-my-notifications.controller.js';
import { ListMyNotificationsService } from './queries/list-my-notifications/list-my-notifications.service.js';

export function createPushSender(
  config: ConfigService<Env, true>,
  outbox: PushOutbox,
): PushSender {
  if (config.get('PUSH_DRIVER', { infer: true }) === 'expo') {
    return new ExpoPushSender(config.get('EXPO_ACCESS_TOKEN', { infer: true }));
  }
  return new ConsolePushSender(outbox);
}

@Module({
  controllers: [
    RegisterPushTokenController,
    RemovePushTokenController,
    ListMyNotificationsController,
    MarkAllNotificationsReadController,
    MarkNotificationReadController,
  ],
  providers: [
    PushOutbox,
    {
      provide: PushSender,
      inject: [ConfigService, PushOutbox],
      useFactory: createPushSender,
    },
    {
      provide: NotificationsRepository,
      useClass: NotificationsPrismaRepository,
    },
    Notifier,
    RegisterPushTokenService,
    RemovePushTokenService,
    ListMyNotificationsService,
    MarkNotificationReadService,
    MarkAllNotificationsReadService,
  ],
  exports: [Notifier, PushOutbox],
})
export class NotificationsModule {}
