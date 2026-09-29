export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export const PushDeliveryStatus = {
  SENT: 'SENT',
  DEVICE_NOT_REGISTERED: 'DEVICE_NOT_REGISTERED',
  FAILED: 'FAILED',
} as const;

export type PushDeliveryStatus =
  (typeof PushDeliveryStatus)[keyof typeof PushDeliveryStatus];

export interface PushDelivery {
  token: string;
  status: PushDeliveryStatus;
  error: string | null;
}

export abstract class PushSender {
  abstract send(messages: PushMessage[]): Promise<PushDelivery[]>;
}
