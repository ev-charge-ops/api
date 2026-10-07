import {
  EXPO_BATCH_SIZE,
  EXPO_PUSH_URL,
  ExpoPushSender,
} from './expo-push-sender.js';
import type { PushMessage } from './push-sender.port.js';

function message(index: number): PushMessage {
  return {
    to: `ExponentPushToken[device-${index}]`,
    title: 'Recarga concluída',
    body: 'Seu veículo terminou de carregar.',
    data: { sessionId: 'session-1' },
  };
}

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function okTickets(count: number) {
  return {
    data: Array.from({ length: count }, () => ({ status: 'ok', id: 'ticket' })),
  };
}

describe('ExpoPushSender', () => {
  it('posts the messages to the Expo push API without an access token', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(okTickets(1)));
    const sender = new ExpoPushSender('', fetcher);

    const deliveries = await sender.send([message(1)]);

    expect(deliveries).toEqual([
      { token: 'ExponentPushToken[device-1]', status: 'SENT', error: null },
    ]);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(EXPO_PUSH_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(init.body as string)).toEqual([
      {
        to: 'ExponentPushToken[device-1]',
        title: 'Recarga concluída',
        body: 'Seu veículo terminou de carregar.',
        data: { sessionId: 'session-1' },
        sound: 'default',
        priority: 'high',
      },
    ]);
  });

  it('sends the access token when configured', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(okTickets(1)));

    await new ExpoPushSender('expo-secret', fetcher).send([message(1)]);

    const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: 'Bearer expo-secret' });
  });

  it('splits large sends into batches of 100', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation((_url: string, init: RequestInit) =>
        Promise.resolve(
          reply(
            okTickets((JSON.parse(init.body as string) as unknown[]).length),
          ),
        ),
      );
    const messages = Array.from({ length: EXPO_BATCH_SIZE + 5 }, (_, index) =>
      message(index),
    );

    const deliveries = await new ExpoPushSender('', fetcher).send(messages);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(deliveries).toHaveLength(EXPO_BATCH_SIZE + 5);
    expect(deliveries.every((delivery) => delivery.status === 'SENT')).toBe(
      true,
    );
  });

  it('flags devices that are no longer registered', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      reply({
        data: [
          { status: 'ok', id: 'ticket-1' },
          {
            status: 'error',
            message: 'not a registered push notification recipient',
            details: { error: 'DeviceNotRegistered' },
          },
          {
            status: 'error',
            message: 'too big',
            details: { error: 'MessageTooBig' },
          },
        ],
      }),
    );

    const deliveries = await new ExpoPushSender('', fetcher).send([
      message(1),
      message(2),
      message(3),
    ]);

    expect(deliveries.map((delivery) => delivery.status)).toEqual([
      'SENT',
      'DEVICE_NOT_REGISTERED',
      'FAILED',
    ]);
    expect(deliveries[2].error).toBe('MessageTooBig');
  });

  it('reports the whole batch as failed when the request fails', async () => {
    const rejected = await new ExpoPushSender(
      '',
      vi.fn().mockRejectedValue(new Error('network down')),
    ).send([message(1)]);
    expect(rejected).toEqual([
      {
        token: 'ExponentPushToken[device-1]',
        status: 'FAILED',
        error: 'Error: network down',
      },
    ]);

    const unauthorized = await new ExpoPushSender(
      '',
      vi
        .fn()
        .mockResolvedValue(
          reply(
            { errors: [{ code: 'UNAUTHORIZED', message: 'bad token' }] },
            401,
          ),
        ),
    ).send([message(1)]);
    expect(unauthorized[0]).toMatchObject({
      status: 'FAILED',
      error: 'HTTP 401: UNAUTHORIZED bad token',
    });
  });
});
