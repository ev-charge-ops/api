import { buildDemoSite, upsertDemoSite } from './demo-charge-points.js';
import { DEMO_ORGANIZATION_ID } from './demo-organization.js';

describe('buildDemoSite', () => {
  it('describes the three prototype charge points', () => {
    const site = buildDemoSite(DEMO_ORGANIZATION_ID);

    expect(
      site.chargePoints.map(({ code, name, type, maxPowerKw }) => ({
        code,
        name,
        type,
        maxPowerKw,
      })),
    ).toEqual([
      {
        code: 'L1-01',
        name: 'Garagem L1 · Vaga 12',
        type: 'PRIVATE',
        maxPowerKw: 7,
      },
      {
        code: 'L1-02',
        name: 'Garagem L1 · Vaga 13',
        type: 'PRIVATE',
        maxPowerKw: 7,
      },
      {
        code: 'L2-01',
        name: 'Garagem L2 · Visitantes',
        type: 'COMMERCIAL',
        maxPowerKw: 22,
      },
    ]);
    expect(site.tariff).toMatchObject({
      utilityRateCents: 89,
      accessFeeCents: 3500,
      idleFeeCentsPerMinute: 25,
      idleFeeCapCents: 3000,
      gracePeriodMinutes: 10,
    });
    expect(site.chargePoints[2].tariff).toMatchObject({ baseRateCents: 189 });
  });
});

describe('upsertDemoSite', () => {
  it('upserts points, chargers and tariffs by fixed ids', async () => {
    const chargePoint = { upsert: vi.fn().mockResolvedValue({}) };
    const charger = { upsert: vi.fn().mockResolvedValue({}) };
    const tariff = { upsert: vi.fn().mockResolvedValue({}) };
    const organization = { update: vi.fn().mockResolvedValue({}) };
    const site = buildDemoSite(DEMO_ORGANIZATION_ID);

    await upsertDemoSite(
      { organization, chargePoint, charger, tariff } as never,
      site,
    );

    expect(organization.update).toHaveBeenCalledWith({
      where: { id: DEMO_ORGANIZATION_ID },
      data: {
        contractedDemandKw: 75,
        commonAreaReserveKw: 11.5,
        minChargingPowerKw: 3.7,
      },
    });

    expect(chargePoint.upsert).toHaveBeenCalledTimes(3);
    expect(charger.upsert).toHaveBeenCalledTimes(3);
    expect(tariff.upsert).toHaveBeenCalledTimes(2);
    expect(tariff.upsert.mock.calls[0][0].create).toMatchObject({
      organizationId: DEMO_ORGANIZATION_ID,
      chargePointId: null,
    });
    expect(tariff.upsert.mock.calls[1][0].create).toMatchObject({
      chargePointId: site.chargePoints[2].id,
      baseRateCents: 189,
    });
  });
});
