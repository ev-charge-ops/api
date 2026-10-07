import type { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import {
  type DemoChargePoint,
  type DemoTariff,
  upsertDemoChargePoint,
  upsertTariff,
} from './demo-charge-points.js';
import {
  buildDemoHistory,
  deterministicId,
  type HistoryDriver,
} from './demo-history.js';

export const DEMO_DC_CHARGER_VENDOR = 'GoodWe HCA DC';
export const DEMO_NETWORK_VISITOR_PROBABILITY = 0.12;

export interface DemoOperator {
  id: string;
  name: string;
  tariff: DemoTariff;
  chargePoints: DemoChargePoint[];
}

interface PointSpec {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  maxPowerKw: number;
  isOnline?: boolean;
}

interface OperatorSpec {
  key: string;
  name: string;
  serialPrefix: string;
  tariff: Omit<DemoTariff, 'id'>;
  points: PointSpec[];
}

const DC_MIN_POWER_KW = 50;

const OPERATORS: OperatorSpec[] = [
  {
    key: 'RVP',
    name: 'Rede Volt Paulista',
    serialPrefix: 'RVP',
    tariff: {
      utilityRateCents: 92,
      baseRateCents: 199,
      accessFeeCents: 0,
      idleFeeCentsPerMinute: 30,
      idleFeeCapCents: 3600,
      gracePeriodMinutes: 10,
    },
    points: [
      {
        code: 'RVP-01',
        name: 'Volt Paulista · Av. Paulista',
        latitude: -23.56872,
        longitude: -46.64661,
        maxPowerKw: 60,
      },
      {
        code: 'RVP-02',
        name: 'Volt Bela Vista · Rua Treze de Maio',
        latitude: -23.56221,
        longitude: -46.64478,
        maxPowerKw: 22,
      },
      {
        code: 'RVP-03',
        name: 'Volt Paraíso · Rua Tutóia',
        latitude: -23.57618,
        longitude: -46.64182,
        maxPowerKw: 11,
      },
      {
        code: 'RVP-04',
        name: 'Volt Ibirapuera · Av. Pedro Álvares Cabral',
        latitude: -23.58524,
        longitude: -46.65671,
        maxPowerKw: 50,
      },
    ],
  },
  {
    key: 'EPS',
    name: 'EletroPosto SP',
    serialPrefix: 'EPS',
    tariff: {
      utilityRateCents: 89,
      baseRateCents: 179,
      accessFeeCents: 0,
      idleFeeCentsPerMinute: 20,
      idleFeeCapCents: 2500,
      gracePeriodMinutes: 15,
    },
    points: [
      {
        code: 'EPS-01',
        name: 'EletroPosto Liberdade · Praça da Liberdade',
        latitude: -23.55531,
        longitude: -46.63578,
        maxPowerKw: 22,
      },
      {
        code: 'EPS-02',
        name: 'EletroPosto Liberdade · Rua da Glória',
        latitude: -23.55884,
        longitude: -46.63291,
        maxPowerKw: 7,
        isOnline: false,
      },
      {
        code: 'EPS-03',
        name: 'EletroPosto Aclimação · Rua Muniz de Sousa',
        latitude: -23.57331,
        longitude: -46.62934,
        maxPowerKw: 11,
      },
      {
        code: 'EPS-04',
        name: 'EletroPosto Cambuci · Largo do Cambuci',
        latitude: -23.56572,
        longitude: -46.62031,
        maxPowerKw: 22,
      },
    ],
  },
  {
    key: 'PJR',
    name: 'Plugue Já Recarga',
    serialPrefix: 'PJR',
    tariff: {
      utilityRateCents: 89,
      baseRateCents: 169,
      accessFeeCents: 0,
      idleFeeCentsPerMinute: 35,
      idleFeeCapCents: 4000,
      gracePeriodMinutes: 5,
    },
    points: [
      {
        code: 'PJR-01',
        name: 'Plugue Já Vila Mariana · Rua Domingos de Morais',
        latitude: -23.58183,
        longitude: -46.63834,
        maxPowerKw: 22,
      },
      {
        code: 'PJR-02',
        name: 'Plugue Já Vila Mariana · Rua Vergueiro',
        latitude: -23.58652,
        longitude: -46.63718,
        maxPowerKw: 7,
      },
      {
        code: 'PJR-03',
        name: 'Plugue Já Aclimação · Av. Lins de Vasconcelos',
        latitude: -23.57224,
        longitude: -46.62382,
        maxPowerKw: 50,
      },
      {
        code: 'PJR-04',
        name: 'Plugue Já Paraíso · Av. Bernardino de Campos',
        latitude: -23.57483,
        longitude: -46.64371,
        maxPowerKw: 11,
      },
    ],
  },
];

function buildPoint(operator: OperatorSpec, spec: PointSpec): DemoChargePoint {
  const isDc = spec.maxPowerKw >= DC_MIN_POWER_KW;
  const serialSuffix = spec.code.split('-')[1];
  return {
    id: deterministicId(`demo-network-point:${spec.code}`),
    code: spec.code,
    name: spec.name,
    type: 'COMMERCIAL',
    latitude: spec.latitude,
    longitude: spec.longitude,
    maxPowerKw: spec.maxPowerKw,
    isOnline: spec.isOnline ?? true,
    charger: {
      id: deterministicId(`demo-network-charger:${spec.code}`),
      serialNumber: isDc
        ? `GW-HCA-DC-${operator.serialPrefix}-${serialSuffix}`
        : `GW-HCA-G2-${operator.serialPrefix}-${serialSuffix}`,
      ...(isDc
        ? { vendor: DEMO_DC_CHARGER_VENDOR, connector: 'CCS_2' as const }
        : { connector: 'TYPE_2' as const }),
    },
    tariff: null,
  };
}

export function buildDemoCommercialNetwork(): DemoOperator[] {
  return OPERATORS.map((operator) => ({
    id: deterministicId(`demo-network-operator:${operator.key}`),
    name: operator.name,
    tariff: {
      id: deterministicId(`demo-network-tariff:${operator.key}`),
      ...operator.tariff,
    },
    chargePoints: operator.points.map((spec) => buildPoint(operator, spec)),
  }));
}

export async function upsertDemoCommercialNetwork(
  prisma: Pick<
    PrismaClient,
    'organization' | 'chargePoint' | 'charger' | 'tariff'
  >,
  operators: DemoOperator[],
): Promise<void> {
  for (const operator of operators) {
    const data = { name: operator.name, type: 'COMMERCIAL' as const };
    await prisma.organization.upsert({
      where: { id: operator.id },
      update: data,
      create: { ...data, id: operator.id },
    });
    await upsertTariff(prisma, operator.id, null, operator.tariff);
    for (const point of operator.chargePoints) {
      await upsertDemoChargePoint(prisma, operator.id, point);
    }
  }
}

export function buildDemoNetworkHistory(input: {
  now: Date;
  operators: DemoOperator[];
  drivers: HistoryDriver[];
}): Prisma.ChargingSessionCreateManyInput[] {
  return input.operators.flatMap((operator) =>
    buildDemoHistory({
      organizationId: operator.id,
      now: input.now,
      drivers: input.drivers,
      visitorProbability: DEMO_NETWORK_VISITOR_PROBABILITY,
      points: operator.chargePoints.map((point) => ({
        id: point.id,
        code: point.code,
        type: point.type,
        maxPowerKw: point.maxPowerKw,
        rateCents:
          operator.tariff.baseRateCents ?? operator.tariff.utilityRateCents,
        idleTerms: {
          idleFeeCentsPerMinute: operator.tariff.idleFeeCentsPerMinute,
          idleFeeCapCents: operator.tariff.idleFeeCapCents,
          gracePeriodMinutes: operator.tariff.gracePeriodMinutes,
        },
      })),
    }),
  );
}
