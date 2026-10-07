import type { ConfigService } from '@nestjs/config';
import type { Clock } from '../../common/clock/clock.js';
import type { Env } from '../../config/env.schema.js';
import type {
  NewNotification,
  NotificationsRepository,
} from './database/notifications.repository.port.js';
import { createPushSender } from './notifications.module.js';
import { Notifier } from './notifier.js';
import { ConsolePushSender } from './push/console-push-sender.js';
import { ExpoPushSender } from './push/expo-push-sender.js';
import { PushOutbox } from './push/push-outbox.js';
import type { PushSender } from './push/push-sender.port.js';

const NOW = new Date('2026-10-07T22:00:00.000Z');

const NOTIFICATION: NewNotification = {
  userId: 'user-1',
  type: 'CHARGING_COMPLETE',
  title: 'Recarga concluída',
  body: 'Seu veículo terminou de carregar.',
  data: { sessionId: 'session-1' },
  dedupeKey: 'session:session-1:CHARGING_COMPLETE',
};

function createRepository(tokens: string[]) {
  return {
    create: vi.fn((notification: NewNotification, at: Date) =>
      Promise.resolve({
        ...notification,
        id: 'notification-1',
        readAt: null,
        createdAt: at,
      }),
    ),
    tokensOf: vi.fn().mockResolvedValue(tokens),
    removeTokens: vi.fn().mockResolvedValue(undefined),
  };
}

function notifierWith(
  repository: ReturnType<typeof createRepository>,
  send: PushSender['send'],
): Notifier {
  return new Notifier(
    repository as unknown as NotificationsRepository,
    { send } as PushSender,
    { now: () => NOW } as Clock,
  );
}

describe('Notifier', () => {
  it('stores the notification and pushes it to every device of the user', async () => {
    const repository = createRepository(['token-a', 'token-b']);
    const send = vi.fn((messages: { to: string }[]) =>
      Promise.resolve(
        messages.map((item) => ({
          token: item.to,
          status: 'SENT' as const,
          error: null,
        })),
      ),
    );

    await expect(
      notifierWith(repository, send).notify(NOTIFICATION),
    ).resolves.toBe(true);

    expect(repository.create).toHaveBeenCalledWith(NOTIFICATION, NOW);
    expect(send).toHaveBeenCalledWith(
      ['token-a', 'token-b'].map((to) => ({
        to,
        title: 'Recarga concluída',
        body: 'Seu veículo terminou de carregar.',
        data: {
          sessionId: 'session-1',
          notificationId: 'notification-1',
          type: 'CHARGING_COMPLETE',
        },
      })),
    );
    expect(repository.removeTokens).not.toHaveBeenCalled();
  });

  it('does not push a notification that already exists', async () => {
    const repository = createRepository(['token-a']);
    repository.create.mockResolvedValue(null as never);
    const send = vi.fn();

    await expect(
      notifierWith(repository, send).notify(NOTIFICATION),
    ).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('forgets devices that are no longer registered', async () => {
    const repository = createRepository(['token-a', 'token-b']);
    const send = vi.fn().mockResolvedValue([
      { token: 'token-a', status: 'DEVICE_NOT_REGISTERED', error: 'gone' },
      { token: 'token-b', status: 'FAILED', error: 'MessageRateExceeded' },
    ]);

    await notifierWith(repository, send).notify(NOTIFICATION);

    expect(repository.removeTokens).toHaveBeenCalledWith(['token-a']);
  });

  it('never throws when storing or pushing fails', async () => {
    const failingStore = createRepository(['token-a']);
    failingStore.create.mockRejectedValue(new Error('database down'));
    await expect(
      notifierWith(failingStore, vi.fn()).notify(NOTIFICATION),
    ).resolves.toBe(false);

    const failingPush = createRepository(['token-a']);
    await expect(
      notifierWith(
        failingPush,
        vi.fn().mockRejectedValue(new Error('expo down')),
      ).notify(NOTIFICATION),
    ).resolves.toBe(true);
  });

  it('stores without pushing when asked to stay silent', async () => {
    const repository = createRepository(['token-a']);
    const send = vi.fn();

    await expect(
      notifierWith(repository, send).notify(NOTIFICATION, { push: false }),
    ).resolves.toBe(true);

    expect(repository.create).toHaveBeenCalledWith(NOTIFICATION, NOW);
    expect(repository.tokensOf).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('skips the push when the user has no device', async () => {
    const repository = createRepository([]);
    const send = vi.fn();

    await notifierWith(repository, send).notify(NOTIFICATION);

    expect(send).not.toHaveBeenCalled();
  });
});

describe('createPushSender', () => {
  function configWith(values: Partial<Env>): ConfigService<Env, true> {
    return {
      get: (key: keyof Env) => values[key],
    } as unknown as ConfigService<Env, true>;
  }

  it('logs pushes to the console by default', () => {
    expect(
      createPushSender(
        configWith({ PUSH_DRIVER: 'console' }),
        new PushOutbox(),
      ),
    ).toBeInstanceOf(ConsolePushSender);
  });

  it('sends through Expo when configured', () => {
    expect(
      createPushSender(
        configWith({ PUSH_DRIVER: 'expo', EXPO_ACCESS_TOKEN: '' }),
        new PushOutbox(),
      ),
    ).toBeInstanceOf(ExpoPushSender);
  });
});

describe('ConsolePushSender', () => {
  it('records the messages in the outbox', async () => {
    const outbox = new PushOutbox();
    const message = { to: 'token-a', title: 'Oi', body: 'Teste', data: {} };

    await expect(
      new ConsolePushSender(outbox).send([message]),
    ).resolves.toEqual([{ token: 'token-a', status: 'SENT', error: null }]);
    expect(outbox.sentTo('token-a')).toEqual([message]);
  });
});
