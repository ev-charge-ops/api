import {
  type PushDelivery,
  PushDeliveryStatus,
  type PushMessage,
  PushSender,
} from './push-sender.port.js';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_BATCH_SIZE = 100;
const REQUEST_TIMEOUT_MS = 5000;

type Fetch = typeof fetch;

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoResponse {
  data?: ExpoTicket[];
  errors?: { code?: string; message?: string }[];
}

export class ExpoPushSender extends PushSender {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: Fetch = fetch,
  ) {
    super();
  }

  async send(messages: PushMessage[]): Promise<PushDelivery[]> {
    const deliveries: PushDelivery[] = [];
    for (let start = 0; start < messages.length; start += EXPO_BATCH_SIZE) {
      const batch = messages.slice(start, start + EXPO_BATCH_SIZE);
      deliveries.push(...(await this.sendBatch(batch)));
    }
    return deliveries;
  }

  private async sendBatch(batch: PushMessage[]): Promise<PushDelivery[]> {
    let response: ExpoResponse;
    try {
      const reply = await this.fetcher(EXPO_PUSH_URL, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(
          batch.map((message) => ({
            to: message.to,
            title: message.title,
            body: message.body,
            data: message.data,
            sound: 'default',
            priority: 'high',
          })),
        ),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      response = (await reply.json()) as ExpoResponse;
      if (!reply.ok && !response.data) {
        return failed(batch, `HTTP ${reply.status}: ${describe(response)}`);
      }
    } catch (error) {
      return failed(batch, String(error));
    }
    return batch.map((message, index) =>
      toDelivery(message.to, response.data?.[index]),
    );
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    };
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }
    return headers;
  }
}

function toDelivery(
  token: string,
  ticket: ExpoTicket | undefined,
): PushDelivery {
  if (!ticket) {
    return { token, status: PushDeliveryStatus.FAILED, error: 'No ticket' };
  }
  if (ticket.status === 'ok') {
    return { token, status: PushDeliveryStatus.SENT, error: null };
  }
  const error = ticket.details?.error ?? ticket.message ?? 'Unknown error';
  return {
    token,
    status:
      ticket.details?.error === 'DeviceNotRegistered'
        ? PushDeliveryStatus.DEVICE_NOT_REGISTERED
        : PushDeliveryStatus.FAILED,
    error,
  };
}

function failed(batch: PushMessage[], error: string): PushDelivery[] {
  return batch.map((message) => ({
    token: message.to,
    status: PushDeliveryStatus.FAILED,
    error,
  }));
}

function describe(response: ExpoResponse): string {
  return (
    response.errors
      ?.map((error) => `${error.code ?? 'ERROR'} ${error.message ?? ''}`.trim())
      .join('; ') ?? 'Unknown error'
  );
}
