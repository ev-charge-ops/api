import { NotFoundException } from '@nestjs/common';
import type { Clock } from '../../../../common/clock/clock.js';
import type { CostSharingRepository } from '../../database/cost-sharing.repository.port.js';
import { GetMonthlyStatementService } from '../get-monthly-statement/get-monthly-statement.service.js';
import { GetMyMonthlyStatementService } from './get-my-monthly-statement.service.js';

const CONDOMINIUM = { id: 'organization-1', name: 'Residencial Aclimação' };
const OTHER = { id: 'organization-2', name: 'Residencial Bela Vista' };

const session = (
  unitLabel: string | null,
  startedAt: string,
  energyWh: number,
  idleFeeCents = 0,
) => ({
  unitLabel,
  startedAt: new Date(startedAt),
  energyWh,
  energyCostCents: Math.round((energyWh * 89) / 1000),
  idleFeeCents,
});

describe('GetMyMonthlyStatementService', () => {
  let repository: {
    findUnitMemberships: ReturnType<typeof vi.fn>;
    findBillableSessions: ReturnType<typeof vi.fn>;
    findUnitsWithVehicle: ReturnType<typeof vi.fn>;
    findOrganizationRates: ReturnType<typeof vi.fn>;
  };
  let now: Date;
  let service: GetMyMonthlyStatementService;

  beforeEach(() => {
    now = new Date('2026-08-20T12:00:00.000Z');
    repository = {
      findUnitMemberships: vi.fn().mockResolvedValue([
        { organization: CONDOMINIUM, unitLabel: 'B · 42' },
        { organization: OTHER, unitLabel: 'C · 7' },
      ]),
      findBillableSessions: vi
        .fn()
        .mockResolvedValue([
          session('B · 42', '2026-08-03T22:00:00.000Z', 11_760),
          session('B · 42', '2026-08-03T23:30:00.000Z', 4050, 150),
          session('A · 11', '2026-08-05T22:00:00.000Z', 9800),
        ]),
      findUnitsWithVehicle: vi.fn().mockResolvedValue(['A · 11', 'B · 42']),
      findOrganizationRates: vi
        .fn()
        .mockResolvedValue({ accessFeeCents: 3500, utilityRateCents: 89 }),
    };
    const clock = { now: () => now } as Clock;
    service = new GetMyMonthlyStatementService(
      repository as unknown as CostSharingRepository,
      new GetMonthlyStatementService(
        repository as unknown as CostSharingRepository,
        clock,
      ),
      clock,
    );
  });

  it('returns the line of the unit of the user with the energy per day', async () => {
    const statement = await service.execute('user-1', '2026-08');

    expect(repository.findBillableSessions).toHaveBeenCalledWith(
      CONDOMINIUM.id,
      expect.objectContaining({ year: 2026, month: 8 }),
    );
    expect(statement).toMatchObject({
      organization: CONDOMINIUM,
      unitLabel: 'B · 42',
      month: '2026-08',
      status: 'OPEN',
      closesAt: new Date('2026-09-01T03:00:00.000Z'),
      energyKwh: 15.81,
      energyCents: 1407,
      utilityRateCents: 89,
      accessFeeCents: 3500,
      idleFeeCents: 150,
      totalCents: 5057,
      sessionsCount: 2,
    });
    expect(statement.dailyEnergy).toHaveLength(31);
    expect(statement.dailyEnergy[2]).toEqual({
      date: '2026-08-03',
      energyKwh: 15.81,
    });
    expect(statement.dailyEnergy[4]).toEqual({
      date: '2026-08-05',
      energyKwh: 0,
    });
  });

  it('closes the statement once the month is over', async () => {
    now = new Date('2026-09-01T03:00:00.000Z');

    const statement = await service.execute('user-1', '2026-08');

    expect(statement.status).toBe('CLOSED');
  });

  it('reads the requested condominium', async () => {
    const statement = await service.execute('user-1', '2026-08', OTHER.id);

    expect(repository.findBillableSessions).toHaveBeenCalledWith(
      OTHER.id,
      expect.anything(),
    );
    expect(statement).toMatchObject({
      organization: OTHER,
      unitLabel: 'C · 7',
      sessionsCount: 0,
      accessFeeCents: 0,
      totalCents: 0,
    });
  });

  it('is not found without a unit in a condominium', async () => {
    await expect(
      service.execute('user-1', '2026-08', 'organization-3'),
    ).rejects.toBeInstanceOf(NotFoundException);

    repository.findUnitMemberships.mockResolvedValue([]);
    await expect(service.execute('user-1', '2026-08')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.findBillableSessions).not.toHaveBeenCalled();
  });
});
