import { buildDemoSite } from './demo-charge-points.js';
import {
  buildDemoCommercialNetwork,
  buildDemoNetworkHistory,
  upsertDemoCommercialNetwork,
} from './demo-commercial-network.js';
import { DEMO_ORGANIZATION_ID } from './demo-organization.js';

const NOW = new Date('2026-10-07T12:00:00.000-03:00');
const CONDOMINIUM = { latitude: -23.569, longitude: -46.631 };

function distanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(to.latitude - from.latitude);
  const dLon = radians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

describe('buildDemoCommercialNetwork', () => {
  const network = buildDemoCommercialNetwork();
  const points = network.flatMap((operator) => operator.chargePoints);

  it('groups twelve commercial points under three fictional operators', () => {
    expect(network.map((operator) => operator.name)).toEqual([
      'Rede Volt Paulista',
      'EletroPosto SP',
      'Plugue Já Recarga',
    ]);
    expect(points).toHaveLength(12);
    expect(points.every((point) => point.type === 'COMMERCIAL')).toBe(true);
  });

  it('places every point within four kilometres of the demo condominium', () => {
    for (const point of points) {
      const distance = distanceKm(CONDOMINIUM, point);
      expect(distance).toBeGreaterThan(0.3);
      expect(distance).toBeLessThan(4);
    }
  });

  it('uses fixed ids and codes that never collide with the condominium', () => {
    const site = buildDemoSite(DEMO_ORGANIZATION_ID);
    const ids = [
      ...network.map((operator) => operator.id),
      ...network.map((operator) => operator.tariff.id),
      ...points.flatMap((point) => [point.id, point.charger.id]),
      ...site.chargePoints.flatMap((point) => [point.id, point.charger.id]),
    ];
    const codes = [...points, ...site.chargePoints].map((point) => point.code);
    const serials = [...points, ...site.chargePoints].map(
      (point) => point.charger.serialNumber,
    );

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(serials).size).toBe(serials.length);
    expect(buildDemoCommercialNetwork()).toEqual(network);
  });

  it('pairs DC fast chargers with CCS 2 and AC chargers with Type 2', () => {
    for (const point of points) {
      if (point.maxPowerKw >= 50) {
        expect(point.charger).toMatchObject({
          vendor: 'GoodWe HCA DC',
          connector: 'CCS_2',
        });
        expect(point.charger.serialNumber).toMatch(/^GW-HCA-DC-/);
      } else {
        expect(point.charger.connector).toBe('TYPE_2');
        expect(point.charger.serialNumber).toMatch(/^GW-HCA-G2-/);
      }
    }
    expect(
      new Set(points.map((point) => point.maxPowerKw)).size,
    ).toBeGreaterThanOrEqual(4);
  });

  it('cycles the network photos through every point', () => {
    expect(points.map((point) => point.photoUrl)).toEqual(
      Array.from(
        { length: 12 },
        (_, index) =>
          `https://app.evchargeops.com.br/media/points/${
            [
              'garage-a.webp',
              'garage-b.webp',
              'charger-wall.webp',
              'charger-wall-b.webp',
            ][index % 4]
          }`,
      ),
    );
    expect(
      buildDemoCommercialNetwork('https://media.example.com')[0].chargePoints[1]
        .photoUrl,
    ).toBe('https://media.example.com/points/garage-b.webp');
  });

  it('keeps a single offline point and gives every operator a dynamic tariff', () => {
    expect(
      points
        .filter((point) => point.isOnline === false)
        .map((point) => point.code),
    ).toEqual(['EPS-02']);
    for (const operator of network) {
      expect(operator.tariff.baseRateCents).toBeGreaterThan(
        operator.tariff.utilityRateCents,
      );
      expect(operator.tariff.accessFeeCents).toBe(0);
    }
    expect(
      new Set(network.map((operator) => operator.tariff.baseRateCents)).size,
    ).toBe(3);
  });
});

describe('upsertDemoCommercialNetwork', () => {
  it('upserts operators, tariffs, points and chargers by fixed ids', async () => {
    const organization = { upsert: vi.fn().mockResolvedValue({}) };
    const chargePoint = { upsert: vi.fn().mockResolvedValue({}) };
    const charger = { upsert: vi.fn().mockResolvedValue({}) };
    const tariff = { upsert: vi.fn().mockResolvedValue({}) };
    const network = buildDemoCommercialNetwork();

    await upsertDemoCommercialNetwork(
      { organization, chargePoint, charger, tariff } as never,
      network,
    );

    expect(organization.upsert).toHaveBeenCalledTimes(3);
    expect(organization.upsert.mock.calls[0][0]).toEqual({
      where: { id: network[0].id },
      update: { name: 'Rede Volt Paulista', type: 'COMMERCIAL' },
      create: {
        id: network[0].id,
        name: 'Rede Volt Paulista',
        type: 'COMMERCIAL',
      },
    });
    expect(tariff.upsert).toHaveBeenCalledTimes(3);
    expect(tariff.upsert.mock.calls[1][0].create).toMatchObject({
      organizationId: network[1].id,
      chargePointId: null,
      baseRateCents: 179,
    });
    expect(chargePoint.upsert).toHaveBeenCalledTimes(12);
    expect(charger.upsert).toHaveBeenCalledTimes(12);
    const offline = chargePoint.upsert.mock.calls
      .map(([args]) => args)
      .find((args) => args.update.code === 'EPS-02');
    expect(offline.update.isOnline).toBe(false);
    expect(offline.update.photoUrl).toBe(
      'https://app.evchargeops.com.br/media/points/garage-b.webp',
    );
    expect(offline.create.organizationId).toBe(network[1].id);
  });
});

describe('buildDemoNetworkHistory', () => {
  const network = buildDemoCommercialNetwork();
  const drivers = [
    { userId: 'user-1', unitLabel: 'A · 11' },
    { userId: 'demo-driver', unitLabel: 'B · 42' },
  ];
  const sessions = buildDemoNetworkHistory({
    now: NOW,
    operators: network,
    drivers,
  });

  it('builds a modest, closed, past history for each operator', () => {
    expect(sessions.length).toBeGreaterThan(60);
    expect(sessions.length).toBeLessThan(250);
    for (const operator of network) {
      expect(
        sessions.some((session) => session.organizationId === operator.id),
      ).toBe(true);
    }
    for (const session of sessions) {
      expect(session.status).toBe('CLOSED');
      expect(session.regime).toBe('COMMERCIAL');
      expect(session.unitLabel).toBeNull();
      expect(new Date(session.endedAt as Date).getTime()).toBeLessThan(
        NOW.getTime(),
      );
    }
  });

  it('applies each operator idle terms and is deterministic', () => {
    const eletroPosto = sessions.filter(
      (session) => session.organizationId === network[1].id,
    );
    for (const session of eletroPosto) {
      expect(session).toMatchObject({
        idleFeeCentsPerMinute: 20,
        idleFeeCapCents: 2500,
        gracePeriodMinutes: 15,
      });
      expect(session.idleFeeCents).toBeLessThanOrEqual(2500);
    }
    expect(
      buildDemoNetworkHistory({ now: NOW, operators: network, drivers }),
    ).toEqual(sessions);
    expect(new Set(sessions.map((session) => session.id)).size).toBe(
      sessions.length,
    );
  });
});
