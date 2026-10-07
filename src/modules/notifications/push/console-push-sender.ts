import { Logger } from '@nestjs/common';
import type { PushOutbox } from './push-outbox.js';
import {
  type PushDelivery,
  PushDeliveryStatus,
  type PushMessage,
  PushSender,
} from './push-sender.port.js';

export class ConsolePushSender extends PushSender {
  private readonly logger = new Logger(ConsolePushSender.name);

  constructor(private readonly outbox: PushOutbox) {
    super();
  }

  send(messages: PushMessage[]): Promise<PushDelivery[]> {
    return Promise.resolve(
      messages.map((message) => {
        this.outbox.record(message);
        this.logger.log(
          `Push to ${message.to}: ${message.title} · ${message.body}`,
        );
        return {
          token: message.to,
          status: PushDeliveryStatus.SENT,
          error: null,
        };
      }),
    );
  }
}
