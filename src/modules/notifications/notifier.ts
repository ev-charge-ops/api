import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import {
  type NewNotification,
  type NotificationRecord,
  NotificationsRepository,
} from './database/notifications.repository.port.js';
import { PushDeliveryStatus, PushSender } from './push/push-sender.port.js';

@Injectable()
export class Notifier {
  private readonly logger = new Logger(Notifier.name);

  constructor(
    private readonly repository: NotificationsRepository,
    private readonly sender: PushSender,
    private readonly clock: Clock,
  ) {}

  async notify(notification: NewNotification): Promise<boolean> {
    let created: NotificationRecord | null;
    try {
      created = await this.repository.create(notification, this.clock.now());
    } catch (error) {
      this.logger.warn(
        `Could not store the ${notification.type} notification for user ${notification.userId}: ${String(error)}`,
      );
      return false;
    }
    if (!created) {
      return false;
    }
    await this.push(created);
    return true;
  }

  private async push(notification: NotificationRecord): Promise<void> {
    try {
      const tokens = await this.repository.tokensOf(notification.userId);
      if (tokens.length === 0) {
        return;
      }
      const deliveries = await this.sender.send(
        tokens.map((to) => ({
          to,
          title: notification.title,
          body: notification.body,
          data: {
            ...notification.data,
            notificationId: notification.id,
            type: notification.type,
          },
        })),
      );
      const unregistered = deliveries
        .filter(
          (delivery) =>
            delivery.status === PushDeliveryStatus.DEVICE_NOT_REGISTERED,
        )
        .map((delivery) => delivery.token);
      if (unregistered.length > 0) {
        await this.repository.removeTokens(unregistered);
      }
      for (const delivery of deliveries) {
        if (delivery.status !== PushDeliveryStatus.SENT) {
          this.logger.warn(
            `Push ${notification.type} ${notification.id} to ${delivery.token} failed: ${delivery.error ?? delivery.status}`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Could not push notification ${notification.id}: ${String(error)}`,
      );
    }
  }
}
