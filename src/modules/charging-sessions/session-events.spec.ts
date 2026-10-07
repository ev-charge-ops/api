import type { Clock } from '../../common/clock/clock.js';
import type { ChargePointQueue } from '../charge-points/queue/charge-point-queue.js';
import type { Notifier } from '../notifications/notifier.js';
import { ChargingSession } from './domain/charging-session.entity.js';
import {
  SessionEvents,
  sessionNotifications,
  snapshotOf,
} from './session-events.js';

const STARTED_AT = new Date('2026-10-07T22:00:00.000Z');
const VEHICLE = { batteryCapacityWh: 50_000, socPercent: 42 };

function at(minutes: number): Date {
  return new Date(STARTED_AT.getTime() + minutes * 60_000);
}

function newSession(regime: 'PRIVATE' | 'COMMERCIAL' = 'PRIVATE') {
  return ChargingSession.create({
    id: 'session-1',
    userId: 'user-1',
    chargePointId: 'point-1',
    chargePointCode: 'L1-01',
    chargePointName: 'Vaga L1-01',
    chargerSerialNumber: 'GW-1',
    organizationId: 'organization-1',
    unitLabel: null,
    regime,
    limit: { type: 'FULL' },
    allocatedPowerKw: 7,
    timeScale: 1,
    lockedRateCents: 89,
    demandFactor: 1,
    demandFactorSource: 'RULE',
    demandModelVersion: null,
    idleFeeCentsPerMinute: 25,
    idleFeeCapCents: 3000,
    gracePeriodMinutes: 10,
    startedAt: STARTED_AT,
  });
}

function activeSession(): ChargingSession {
  const session = newSession();
  session.activate('tx-1', VEHICLE, STARTED_AT);
  return session;
}

function finishedSession(): ChargingSession {
  const session = activeSession();
  session.recordTelemetry(
    { at: at(240), energyWh: 29_000, powerKw: 0, socPercent: 100 },
    at(240),
    at(240),
  );
  return session;
}

function types(session: ChargingSession): string[] {
  return sessionNotifications(session).map((item) => item.type);
}

describe('sessionNotifications', () => {
  it('announces the charger release with the session in the payload', () => {
    expect(sessionNotifications(activeSession())).toEqual([
      {
        userId: 'user-1',
        type: 'SESSION_ACTIVE',
        title: 'Carregador liberado',
        body: 'Sua recarga no ponto Vaga L1-01 começou.',
        data: {
          sessionId: 'session-1',
          chargePointId: 'point-1',
          chargePointName: 'Vaga L1-01',
        },
        dedupeKey: 'session:session-1:SESSION_ACTIVE',
      },
    ]);
  });

  it('announces the end of charging with the tolerance', () => {
    const [complete] = sessionNotifications(finishedSession());

    expect(complete).toMatchObject({
      type: 'CHARGING_COMPLETE',
      title: 'Recarga concluída',
      body: 'Seu veículo no ponto Vaga L1-01 terminou de carregar. Você tem 10 minutos de tolerância para liberar a vaga antes da multa por ociosidade.',
      data: {
        graceEndsAt: at(250).toISOString(),
        gracePeriodMinutes: 10,
      },
    });
  });

  it('announces the idle fee together with the completion when read late', () => {
    const session = finishedSession();
    session.advance(at(260));

    const notifications = sessionNotifications(session);
    expect(notifications.map((item) => item.type)).toEqual([
      'CHARGING_COMPLETE',
      'IDLE_FEE_STARTED',
    ]);
    expect(notifications[1]).toMatchObject({
      title: 'Multa por ociosidade iniciada',
      body: 'A tolerância no ponto Vaga L1-01 acabou. A multa é de R$ 0,25 por minuto, até R$ 30,00. Libere a vaga para encerrar a sessão.',
      data: {
        idleStartsAt: at(250).toISOString(),
        idleFeeCapReachedAt: at(370).toISOString(),
        idleFeeCentsPerMinute: 25,
        idleFeeCapCents: 3000,
      },
    });
  });

  it('announces interrupted sessions', () => {
    const session = newSession();
    session.interrupt(at(1));

    expect(sessionNotifications(session)).toMatchObject([
      {
        type: 'SESSION_INTERRUPTED',
        title: 'Recarga interrompida',
        body: 'A recarga no ponto Vaga L1-01 foi interrompida antes de começar. Nenhum valor será cobrado.',
      },
    ]);
  });

  it('announces captured and failed card payments', () => {
    const paid = newSession('COMMERCIAL');
    paid.attachPayment({
      intentId: 'pi_1',
      customerId: 'cus_1',
      amountCents: 5000,
    });
    paid.recordPaymentFailed('card_declined');
    expect(sessionNotifications(paid)).toMatchObject([
      {
        type: 'PAYMENT_FAILED',
        title: 'Pagamento recusado',
        data: { failureCode: 'card_declined' },
      },
    ]);

    paid.recordPaymentAuthorized(5000, at(1));
    paid.activate('tx-1', VEHICLE, at(1));
    paid.stop(at(2));
    paid.recordPaymentCaptured(1041, at(2));
    expect(sessionNotifications(paid)).toMatchObject([
      {
        type: 'PAYMENT_CAPTURED',
        title: 'Pagamento confirmado',
        body: 'Cobramos R$ 10,41 no cartão pela recarga no ponto Vaga L1-01.',
        data: { amountCents: 1041, currency: 'BRL' },
        dedupeKey: 'session:session-1:PAYMENT_CAPTURED',
      },
    ]);
  });

  it('has nothing to say about pending or closed sessions', () => {
    expect(types(newSession())).toEqual([]);
    const closed = activeSession();
    closed.stop(at(30));
    expect(types(closed)).toEqual([]);
  });
});

describe('SessionEvents', () => {
  const notify = vi.fn();
  const advance = vi.fn();
  let events: SessionEvents;

  beforeEach(() => {
    notify.mockReset().mockResolvedValue(true);
    advance.mockReset().mockResolvedValue(undefined);
    events = new SessionEvents(
      { notify } as unknown as Notifier,
      { advance } as unknown as ChargePointQueue,
      { now: () => at(500) } as Clock,
    );
  });

  it('notifies only when the status or the payment changed', async () => {
    const session = activeSession();

    await events.changed(snapshotOf(session), session);
    expect(notify).not.toHaveBeenCalled();

    const before = snapshotOf(session);
    session.recordTelemetry(
      { at: at(240), energyWh: 29_000, powerKw: 0, socPercent: 100 },
      at(240),
      at(240),
    );
    await events.changed(before, session);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0][0]).toMatchObject({
      type: 'CHARGING_COMPLETE',
    });
    expect(advance).not.toHaveBeenCalled();
  });

  it('frees the point for the queue when the session ends', async () => {
    const closed = activeSession();
    const before = snapshotOf(closed);
    closed.stop(at(30));
    await events.changed(before, closed);
    expect(advance).toHaveBeenCalledWith('point-1', at(500));

    const interrupted = newSession();
    const pending = snapshotOf(interrupted);
    interrupted.interrupt(at(1));
    await events.changed(pending, interrupted);
    expect(advance).toHaveBeenCalledTimes(2);

    await events.changed(snapshotOf(closed), closed);
    expect(advance).toHaveBeenCalledTimes(2);
  });
});
