import type { PrismaClient } from '../src/generated/prisma/client.js';
import type {
  ChargePointType,
  ConnectorType,
} from '../src/generated/prisma/enums.js';

export const DEMO_CHARGER_VENDOR = 'GoodWe HCA G2';
export const DEMO_TARIFF_VALID_FROM = new Date('2026-01-01T03:00:00.000Z');

export interface DemoTariff {
  id: string;
  utilityRateCents: number;
  baseRateCents: number | null;
  accessFeeCents: number;
  idleFeeCentsPerMinute: number;
  idleFeeCapCents: number;
  gracePeriodMinutes: number;
}

export interface DemoChargePoint {
  id: string;
  code: string;
  name: string;
  type: ChargePointType;
  latitude: number;
  longitude: number;
  maxPowerKw: number;
  isOnline?: boolean;
  charger: {
    id: string;
    serialNumber: string;
    vendor?: string;
    connector?: ConnectorType;
  };
  tariff: DemoTariff | null;
}

export interface DemoSiteCapacity {
  contractedDemandKw: number;
  commonAreaReserveKw: number;
  minChargingPowerKw: number;
}

export interface DemoSite {
  organizationId: string;
  capacity: DemoSiteCapacity;
  tariff: DemoTariff;
  chargePoints: DemoChargePoint[];
}

const IDLE_TERMS = {
  idleFeeCentsPerMinute: 25,
  idleFeeCapCents: 3000,
  gracePeriodMinutes: 10,
};

export function buildDemoSite(organizationId: string): DemoSite {
  return {
    organizationId,
    capacity: {
      contractedDemandKw: 75,
      commonAreaReserveKw: 11.5,
      minChargingPowerKw: 3.7,
    },
    tariff: {
      id: '5b0e8c1d-2f3a-4b6c-8d7e-9f0a1b2c3d00',
      utilityRateCents: 89,
      baseRateCents: null,
      accessFeeCents: 3500,
      ...IDLE_TERMS,
    },
    chargePoints: [
      {
        id: '5b0e8c1d-2f3a-4b6c-8d7e-9f0a1b2c3d01',
        code: 'L1-01',
        name: 'Garagem L1 · Vaga 12',
        type: 'PRIVATE',
        latitude: -23.56905,
        longitude: -46.63145,
        maxPowerKw: 7,
        charger: {
          id: '5b0e8c1d-2f3a-4b6c-8d7e-9f0a1b2c3e01',
          serialNumber: 'GW-HCA-G2-0001',
        },
        tariff: null,
      },
      {
        id: '5b0e8c1d-2f3a-4b6c-8d7e-9f0a1b2c3d02',
        code: 'L1-02',
        name: 'Garagem L1 · Vaga 13',
        type: 'PRIVATE',
        latitude: -23.56928,
        longitude: -46.63102,
        maxPowerKw: 7,
        charger: {
          id: '5b0e8c1d-2f3a-4b6c-8d7e-9f0a1b2c3e02',
          serialNumber: 'GW-HCA-G2-0002',
        },
        tariff: null,
      },
      {
        id: '5b0e8c1d-2f3a-4b6c-8d7e-9f0a1b2c3d03',
        code: 'L2-01',
        name: 'Garagem L2 · Visitantes',
        type: 'COMMERCIAL',
        latitude: -23.5699,
        longitude: -46.6323,
        maxPowerKw: 22,
        charger: {
          id: '5b0e8c1d-2f3a-4b6c-8d7e-9f0a1b2c3e03',
          serialNumber: 'GW-HCA-G2-0003',
        },
        tariff: {
          id: '5b0e8c1d-2f3a-4b6c-8d7e-9f0a1b2c3d13',
          utilityRateCents: 89,
          baseRateCents: 189,
          accessFeeCents: 0,
          ...IDLE_TERMS,
        },
      },
    ],
  };
}

export async function upsertDemoSite(
  prisma: Pick<
    PrismaClient,
    'organization' | 'chargePoint' | 'charger' | 'tariff'
  >,
  site: DemoSite,
): Promise<void> {
  const { organizationId } = site;
  await prisma.organization.update({
    where: { id: organizationId },
    data: site.capacity,
  });
  await upsertTariff(prisma, organizationId, null, site.tariff);

  for (const point of site.chargePoints) {
    await upsertDemoChargePoint(prisma, organizationId, point);
  }
}

export async function upsertDemoChargePoint(
  prisma: Pick<PrismaClient, 'chargePoint' | 'charger' | 'tariff'>,
  organizationId: string,
  point: DemoChargePoint,
): Promise<void> {
  const data = {
    code: point.code,
    name: point.name,
    type: point.type,
    latitude: point.latitude,
    longitude: point.longitude,
    maxPowerKw: point.maxPowerKw,
    ...(point.isOnline === undefined ? {} : { isOnline: point.isOnline }),
  };
  await prisma.chargePoint.upsert({
    where: { id: point.id },
    update: data,
    create: { ...data, id: point.id, organizationId },
  });

  const charger = {
    vendor: point.charger.vendor ?? DEMO_CHARGER_VENDOR,
    serialNumber: point.charger.serialNumber,
    connector: point.charger.connector ?? ('TYPE_2' as const),
  };
  await prisma.charger.upsert({
    where: { id: point.charger.id },
    update: charger,
    create: { ...charger, id: point.charger.id, chargePointId: point.id },
  });

  if (point.tariff) {
    await upsertTariff(prisma, organizationId, point.id, point.tariff);
  }
}

export async function upsertTariff(
  prisma: Pick<PrismaClient, 'tariff'>,
  organizationId: string,
  chargePointId: string | null,
  tariff: DemoTariff,
): Promise<void> {
  const { id, ...terms } = tariff;
  await prisma.tariff.upsert({
    where: { id },
    update: terms,
    create: {
      ...terms,
      id,
      organizationId,
      chargePointId,
      validFrom: DEMO_TARIFF_VALID_FROM,
    },
  });
}
