import {
  buildDemoSite,
  upsertDemoChargePoint,
  upsertDemoSite,
} from './demo-charge-points.js';
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

  it('gives every point a photo under the media base url', () => {
    expect(
      buildDemoSite(DEMO_ORGANIZATION_ID).chargePoints.map(
        (point) => point.photoUrl,
      ),
    ).toEqual([
      'https://app.evchargeops.com.br/media/points/garage-a.webp',
      'https://app.evchargeops.com.br/media/points/charger-wall.webp',
      'https://app.evchargeops.com.br/media/points/garage-b.webp',
    ]);
    expect(
      buildDemoSite(DEMO_ORGANIZATION_ID, 'http://localhost:5173/media')
        .chargePoints[0].photoUrl,
    ).toBe('http://localhost:5173/media/points/garage-a.webp');
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
    expect(chargePoint.upsert.mock.calls[1][0]).toMatchObject({
      update: { photoUrl: site.chargePoints[1].photoUrl },
      create: { photoUrl: site.chargePoints[1].photoUrl },
    });
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

describe('upsertDemoChargePoint', () => {
  it('keeps the online state untouched unless the point sets it', async () => {
    const chargePoint = { upsert: vi.fn().mockResolvedValue({}) };
    const charger = { upsert: vi.fn().mockResolvedValue({}) };
    const tariff = { upsert: vi.fn().mockResolvedValue({}) };
    const [point] = buildDemoSite(DEMO_ORGANIZATION_ID).chargePoints;

    await upsertDemoChargePoint(
      { chargePoint, charger, tariff } as never,
      DEMO_ORGANIZATION_ID,
      point,
    );
    await upsertDemoChargePoint(
      { chargePoint, charger, tariff } as never,
      DEMO_ORGANIZATION_ID,
      {
        ...point,
        isOnline: false,
        charger: {
          ...point.charger,
          vendor: 'GoodWe HCA DC',
          connector: 'CCS_2',
        },
      },
    );

    expect(chargePoint.upsert.mock.calls[0][0].update).not.toHaveProperty(
      'isOnline',
    );
    expect(chargePoint.upsert.mock.calls[1][0].update.isOnline).toBe(false);
    expect(charger.upsert.mock.calls[0][0].update).toMatchObject({
      vendor: 'GoodWe HCA G2',
      connector: 'TYPE_2',
    });
    expect(charger.upsert.mock.calls[1][0].update).toMatchObject({
      vendor: 'GoodWe HCA DC',
      connector: 'CCS_2',
    });
    expect(tariff.upsert).not.toHaveBeenCalled();
  });
});
