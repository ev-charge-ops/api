import type { MonthRange } from '../../../common/time/sao-paulo-time.js';
import type {
  ChargingSession,
  MeterSample,
} from '../domain/charging-session.entity.js';

export const CreateSessionResult = {
  CREATED: 'CREATED',
  CHARGE_POINT_BUSY: 'CHARGE_POINT_BUSY',
  ACTIVE_SESSION_EXISTS: 'ACTIVE_SESSION_EXISTS',
} as const;

export type CreateSessionResult =
  (typeof CreateSessionResult)[keyof typeof CreateSessionResult];

export interface SessionPage {
  items: ChargingSession[];
  total: number;
}

export abstract class ChargingSessionRepository {
  abstract findById(id: string): Promise<ChargingSession | null>;

  abstract findByPaymentIntentId(
    intentId: string,
  ): Promise<ChargingSession | null>;

  abstract findOpenByUser(userId: string): Promise<ChargingSession | null>;

  abstract listByUser(
    userId: string,
    page: { skip: number; take: number },
    range?: MonthRange,
  ): Promise<SessionPage>;

  abstract chargingPowerKw(organizationId: string): Promise<number>;

  abstract createExclusive(
    session: ChargingSession,
  ): Promise<CreateSessionResult>;

  abstract save(
    session: ChargingSession,
    readings: MeterSample[],
  ): Promise<boolean>;

  abstract findReadings(sessionId: string): Promise<MeterSample[]>;
}
