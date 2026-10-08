import { readFileSync } from 'node:fs';
import { deterministicId } from './demo-history.js';
import {
  buildOcmNetwork,
  connectorOf,
  countByUf,
  type OcmPoi,
  operatorTariff,
  ufFromState,
  writeOcmNetwork,
} from './ocm-network.js';

const FIXTURE = JSON.parse(
  readFileSync(new URL('./fixtures/ocm-pois.json', import.meta.url), 'utf8'),
) as OcmPoi[];

const MEDIA = 'https://media.example.com';

function network() {
  return buildOcmNetwork(FIXTURE, MEDIA);
}

function pointOf(poiId: number) {
  const point = network().points.find(
    (candidate) => candidate.externalId === String(poiId),
  );
  if (!point) {
    throw new Error(`POI ${poiId} was not mapped`);
  }
  return point;
}

describe('buildOcmNetwork', () => {
  it('maps one charge point per POI with coordinates, ignoring duplicates', () => {
    expect(network().points.map((point) => point.externalId)).toEqual([
      '1001',
      '1002',
      '1003',
      '1004',
      '1006',
      '1007',
    ]);
  });

  it('maps a known operator POI with its fastest connection', () => {
    expect(pointOf(1001)).toEqual({
      id: deterministicId('ocm-point:1001'),
      externalId: '1001',
      organizationId: deterministicId('ocm-operator:23'),
      code: 'OCM-1001',
      name: 'Shopping Morumbi',
      uf: 'SP',
      latitude: -23.6229,
      longitude: -46.6989,
      maxPowerKw: 150,
      isOnline: true,
      photoUrl: `${MEDIA}/points/garage-a.webp`,
      charger: {
        id: deterministicId('ocm-charger:1001'),
        serialNumber: 'GW-OCM-1001',
        vendor: 'GoodWe HCA DC',
        connector: 'CCS_2',
      },
    });
  });

  it('marks only operational POIs as online', () => {
    expect(pointOf(1001).isOnline).toBe(true);
    expect(pointOf(1002).isOnline).toBe(false);
    expect(pointOf(1003).isOnline).toBe(false);
    expect(pointOf(1004).isOnline).toBe(true);
    expect(pointOf(1006).isOnline).toBe(true);
  });

  it('maps the connectors to the schema enum and fills the missing power', () => {
    expect(pointOf(1002)).toMatchObject({
      maxPowerKw: 22,
      charger: { connector: 'TYPE_2', vendor: 'GoodWe HCA G2' },
    });
    expect(pointOf(1003)).toMatchObject({
      maxPowerKw: 50,
      charger: { connector: 'CCS_2' },
    });
    expect(pointOf(1004)).toMatchObject({
      maxPowerKw: 7.4,
      charger: { connector: 'OTHER' },
    });
    expect(pointOf(1006)).toMatchObject({
      maxPowerKw: 400,
      charger: { connector: 'CCS_2' },
    });
    expect(pointOf(1007)).toMatchObject({
      maxPowerKw: 7,
      charger: { connector: 'OTHER' },
    });
  });

  it('finds the UF from the state name, the abbreviation or the coordinates', () => {
    expect(pointOf(1002).uf).toBe('RJ');
    expect(pointOf(1003).uf).toBe('DF');
    expect(pointOf(1004).uf).toBe('PR');
    expect(pointOf(1006).uf).toBe('PR');
    expect(pointOf(1007).uf).toBe('RJ');
  });

  it('groups unknown operators in a public network per UF', () => {
    const { operators } = network();

    expect(operators.map(({ key, name }) => ({ key, name }))).toEqual([
      { key: '23', name: 'Tesla (Tesla-only charging)' },
      { key: 'public:RJ', name: 'Rede pública · RJ' },
      { key: 'public:DF', name: 'Rede pública · DF' },
      { key: '3456', name: 'EDP' },
    ]);
    expect(pointOf(1002).organizationId).toBe(
      deterministicId('ocm-operator:public:RJ'),
    );
    expect(pointOf(1007).organizationId).toBe(pointOf(1002).organizationId);
    expect(pointOf(1003).organizationId).toBe(
      deterministicId('ocm-operator:public:DF'),
    );
  });

  it('names POIs without a title and cycles the demo photos', () => {
    expect(pointOf(1004).name).toBe('Eletroposto OCM 1004');
    expect(network().points.map((point) => point.photoUrl)).toEqual([
      `${MEDIA}/points/garage-a.webp`,
      `${MEDIA}/points/garage-b.webp`,
      `${MEDIA}/points/charger-wall.webp`,
      `${MEDIA}/points/charger-wall-b.webp`,
      `${MEDIA}/points/garage-a.webp`,
      `${MEDIA}/points/garage-b.webp`,
    ]);
  });

  it('does not depend on the order of the POIs', () => {
    const withoutDuplicate = FIXTURE.filter((_, index) => index !== 6);

    expect(buildOcmNetwork([...withoutDuplicate].reverse(), MEDIA)).toEqual(
      network(),
    );
  });
});

describe('operatorTariff', () => {
  it('varies the demo tariff by operator within the configured ranges', () => {
    const tariffs = ['23', '3456', 'public:SP', 'public:RJ', '99'].map(
      operatorTariff,
    );

    for (const tariff of tariffs) {
      expect(tariff.baseRateCents).toBeGreaterThanOrEqual(149);
      expect(tariff.baseRateCents).toBeLessThanOrEqual(229);
      expect(tariff.idleFeeCentsPerMinute).toBeGreaterThanOrEqual(20);
      expect(tariff.idleFeeCentsPerMinute).toBeLessThanOrEqual(35);
      expect([5, 10, 15]).toContain(tariff.gracePeriodMinutes);
      expect(tariff.idleFeeCapCents).toBeGreaterThanOrEqual(2500);
      expect(tariff).toMatchObject({ utilityRateCents: 89, accessFeeCents: 0 });
    }
    expect(new Set(tariffs.map((tariff) => tariff.baseRateCents)).size).toBe(
      tariffs.length,
    );
    expect(operatorTariff('23')).toEqual(operatorTariff('23'));
    expect(operatorTariff('23').id).toBe(deterministicId('ocm-tariff:23'));
  });
});

describe('ufFromState', () => {
  it('reads names with or without accents and abbreviations', () => {
    expect(ufFromState('São Paulo')).toBe('SP');
    expect(ufFromState('sao paulo')).toBe('SP');
    expect(ufFromState('SP')).toBe('SP');
    expect(ufFromState('Rio Grande do Sul')).toBe('RS');
    expect(ufFromState('Rio Grande do Norte')).toBe('RN');
    expect(ufFromState('Mato Grosso do Sul')).toBe('MS');
    expect(ufFromState('Mato Grosso')).toBe('MT');
    expect(ufFromState('Paraíba')).toBe('PB');
    expect(ufFromState('Pará')).toBe('PA');
    expect(ufFromState('Belo Horizonte, MG')).toBe('MG');
    expect(ufFromState('Ontario')).toBeNull();
    expect(ufFromState(null)).toBeNull();
  });
});

describe('connectorOf', () => {
  it('falls back to the connection title', () => {
    expect(
      connectorOf({ ConnectionType: { Title: 'Mennekes (Type 2)' } }),
    ).toBe('TYPE_2');
    expect(connectorOf({ ConnectionType: { Title: 'CHAdeMO' } })).toBe(
      'CHADEMO',
    );
    expect(connectorOf({ ConnectionTypeID: 27 })).toBe('OTHER');
  });
});

describe('countByUf', () => {
  it('counts the points and the online ones per UF', () => {
    expect(countByUf(network().points)).toEqual([
      { uf: 'PR', total: 2, online: 2 },
      { uf: 'RJ', total: 2, online: 1 },
      { uf: 'DF', total: 1, online: 0 },
      { uf: 'SP', total: 1, online: 1 },
    ]);
  });
});

describe('writeOcmNetwork', () => {
  it('upserts the operators and writes the points in batches', async () => {
    const prisma = {
      organization: { upsert: vi.fn().mockResolvedValue({}) },
      tariff: { upsert: vi.fn().mockResolvedValue({}) },
      chargePoint: { createMany: vi.fn().mockResolvedValue({ count: 6 }) },
      charger: { createMany: vi.fn().mockResolvedValue({ count: 6 }) },
      $executeRaw: vi.fn().mockResolvedValue(2),
    };

    const result = await writeOcmNetwork(prisma as never, network());

    expect(result).toEqual({ operators: 4, created: 6, updated: 2 });
    expect(prisma.organization.upsert).toHaveBeenCalledWith({
      where: { id: deterministicId('ocm-operator:23') },
      update: { name: 'Tesla (Tesla-only charging)', type: 'COMMERCIAL' },
      create: {
        id: deterministicId('ocm-operator:23'),
        name: 'Tesla (Tesla-only charging)',
        type: 'COMMERCIAL',
      },
    });
    expect(prisma.tariff.upsert).toHaveBeenCalledTimes(4);
    const [pointsCall] = prisma.chargePoint.createMany.mock.calls[0];
    expect(pointsCall.skipDuplicates).toBe(true);
    expect(pointsCall.data[0]).toMatchObject({
      code: 'OCM-1001',
      type: 'COMMERCIAL',
      source: 'OCM',
      externalId: '1001',
    });
    const [chargersCall] = prisma.charger.createMany.mock.calls[0];
    expect(chargersCall).toMatchObject({ skipDuplicates: true });
    expect(chargersCall.data[0]).toMatchObject({
      serialNumber: 'GW-OCM-1001',
      chargePointId: deterministicId('ocm-point:1001'),
    });
  });
});
