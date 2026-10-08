import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client.js';
import type { ConnectorType } from '../src/generated/prisma/enums.js';
import {
  DEMO_CHARGER_VENDOR,
  type DemoTariff,
  upsertTariff,
} from './demo-charge-points.js';
import { DEMO_DC_CHARGER_VENDOR } from './demo-commercial-network.js';
import { deterministicId } from './demo-history.js';
import {
  DEFAULT_MEDIA_BASE_URL,
  NETWORK_POINT_PHOTOS,
  pointPhotoUrl,
} from './demo-media.js';

export interface OcmConnection {
  ConnectionTypeID?: number | null;
  ConnectionType?: { ID?: number | null; Title?: string | null } | null;
  PowerKW?: number | null;
}

export interface OcmPoi {
  ID: number;
  OperatorID?: number | null;
  OperatorInfo?: { ID?: number | null; Title?: string | null } | null;
  StatusTypeID?: number | null;
  StatusType?: { ID?: number | null; IsOperational?: boolean | null } | null;
  AddressInfo?: {
    Title?: string | null;
    Town?: string | null;
    StateOrProvince?: string | null;
    Latitude?: number | null;
    Longitude?: number | null;
  } | null;
  Connections?: OcmConnection[] | null;
}

export interface Box {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface OcmOperator {
  id: string;
  key: string;
  name: string;
  tariff: DemoTariff;
}

export interface OcmPoint {
  id: string;
  externalId: string;
  organizationId: string;
  code: string;
  name: string;
  uf: string;
  latitude: number;
  longitude: number;
  maxPowerKw: number;
  isOnline: boolean;
  photoUrl: string;
  charger: {
    id: string;
    serialNumber: string;
    vendor: string;
    connector: ConnectorType;
  };
}

export interface OcmNetwork {
  operators: OcmOperator[];
  points: OcmPoint[];
}

export interface OcmWriteResult {
  operators: number;
  created: number;
  updated: number;
}

export const UNKNOWN_UF = 'BR';

export const UF_BOXES: Record<string, Box> = {
  AC: { minLat: -11.2, maxLat: -7.1, minLng: -74.0, maxLng: -66.6 },
  AL: { minLat: -10.5, maxLat: -8.8, minLng: -38.3, maxLng: -35.1 },
  AM: { minLat: -9.9, maxLat: 2.3, minLng: -73.8, maxLng: -56.0 },
  AP: { minLat: -1.3, maxLat: 4.5, minLng: -54.9, maxLng: -49.8 },
  BA: { minLat: -18.4, maxLat: -8.5, minLng: -46.7, maxLng: -37.3 },
  CE: { minLat: -7.9, maxLat: -2.7, minLng: -41.5, maxLng: -37.2 },
  DF: { minLat: -16.1, maxLat: -15.5, minLng: -48.3, maxLng: -47.3 },
  ES: { minLat: -21.4, maxLat: -17.8, minLng: -41.9, maxLng: -39.6 },
  GO: { minLat: -19.6, maxLat: -12.3, minLng: -53.3, maxLng: -45.9 },
  MA: { minLat: -10.3, maxLat: -1.0, minLng: -48.8, maxLng: -41.8 },
  MG: { minLat: -23.0, maxLat: -14.2, minLng: -51.1, maxLng: -39.8 },
  MS: { minLat: -24.1, maxLat: -17.1, minLng: -58.2, maxLng: -50.9 },
  MT: { minLat: -18.1, maxLat: -7.3, minLng: -61.7, maxLng: -50.2 },
  PA: { minLat: -9.9, maxLat: 2.6, minLng: -58.9, maxLng: -46.0 },
  PB: { minLat: -8.4, maxLat: -6.0, minLng: -38.8, maxLng: -34.7 },
  PE: { minLat: -9.5, maxLat: -3.8, minLng: -41.4, maxLng: -32.3 },
  PI: { minLat: -11.0, maxLat: -2.7, minLng: -46.0, maxLng: -40.3 },
  PR: { minLat: -26.8, maxLat: -22.5, minLng: -54.7, maxLng: -48.0 },
  RJ: { minLat: -23.4, maxLat: -20.7, minLng: -44.9, maxLng: -40.9 },
  RN: { minLat: -7.0, maxLat: -4.8, minLng: -38.6, maxLng: -34.9 },
  RO: { minLat: -13.7, maxLat: -7.9, minLng: -66.9, maxLng: -59.7 },
  RR: { minLat: -1.6, maxLat: 5.3, minLng: -64.9, maxLng: -58.8 },
  RS: { minLat: -33.8, maxLat: -27.0, minLng: -57.7, maxLng: -49.6 },
  SC: { minLat: -29.4, maxLat: -25.9, minLng: -53.9, maxLng: -48.3 },
  SE: { minLat: -11.6, maxLat: -9.5, minLng: -38.3, maxLng: -36.4 },
  SP: { minLat: -25.4, maxLat: -19.7, minLng: -53.2, maxLng: -44.1 },
  TO: { minLat: -13.5, maxLat: -5.1, minLng: -50.8, maxLng: -45.6 },
};

const UF_NAMES: Record<string, string> = {
  AC: 'acre',
  AL: 'alagoas',
  AM: 'amazonas',
  AP: 'amapa',
  BA: 'bahia',
  CE: 'ceara',
  DF: 'distrito federal',
  ES: 'espirito santo',
  GO: 'goias',
  MA: 'maranhao',
  MG: 'minas gerais',
  MS: 'mato grosso do sul',
  MT: 'mato grosso',
  PA: 'para',
  PB: 'paraiba',
  PE: 'pernambuco',
  PI: 'piaui',
  PR: 'parana',
  RJ: 'rio de janeiro',
  RN: 'rio grande do norte',
  RO: 'rondonia',
  RR: 'roraima',
  RS: 'rio grande do sul',
  SC: 'santa catarina',
  SE: 'sergipe',
  SP: 'sao paulo',
  TO: 'tocantins',
};

const NAMES_BY_LENGTH = Object.entries(UF_NAMES).sort(
  ([, a], [, b]) => b.length - a.length,
);

const BOXES_BY_AREA = Object.entries(UF_BOXES).sort(
  ([, a], [, b]) => area(a) - area(b),
);

const UNKNOWN_OPERATOR_IDS = new Set([1, 44, 45]);
const OPERATIONAL_STATUS_IDS = new Set([10, 20, 50, 75]);
const CONNECTOR_BY_TYPE_ID: Record<number, ConnectorType> = {
  2: 'CHADEMO',
  25: 'TYPE_2',
  33: 'CCS_2',
  1036: 'TYPE_2',
};
const CONNECTOR_PRIORITY: ConnectorType[] = [
  'CCS_2',
  'CHADEMO',
  'TYPE_2',
  'OTHER',
];
const DEFAULT_POWER_KW: Record<ConnectorType, number> = {
  CCS_2: 50,
  CHADEMO: 50,
  TYPE_2: 22,
  OTHER: 7,
};
const MAX_POWER_KW = 400;
const DC_MIN_POWER_KW = 50;
const UTILITY_RATE_CENTS = 89;
const MIN_BASE_RATE_CENTS = 149;
const BASE_RATE_SPREAD_CENTS = 81;
const WRITE_BATCH_SIZE = 500;

function area(box: Box): number {
  return (box.maxLat - box.minLat) * (box.maxLng - box.minLng);
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contains(box: Box, latitude: number, longitude: number): boolean {
  return (
    latitude >= box.minLat &&
    latitude <= box.maxLat &&
    longitude >= box.minLng &&
    longitude <= box.maxLng
  );
}

export function ufFromState(state: string | null | undefined): string | null {
  if (!state) {
    return null;
  }
  const normalized = normalize(state);
  const exact = NAMES_BY_LENGTH.find(([, name]) => name === normalized);
  if (exact) {
    return exact[0];
  }
  const code = normalized
    .split(' ')
    .map((word) => word.toUpperCase())
    .find((word) => word.length === 2 && UF_NAMES[word]);
  if (code) {
    return code;
  }
  const partial = NAMES_BY_LENGTH.find(([, name]) =>
    ` ${normalized} `.includes(` ${name} `),
  );
  return partial ? partial[0] : null;
}

export function ufOf(poi: OcmPoi): string {
  const fromState = ufFromState(poi.AddressInfo?.StateOrProvince);
  if (fromState) {
    return fromState;
  }
  const latitude = poi.AddressInfo?.Latitude;
  const longitude = poi.AddressInfo?.Longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return UNKNOWN_UF;
  }
  const box = BOXES_BY_AREA.find(([, candidate]) =>
    contains(candidate, latitude, longitude),
  );
  return box ? box[0] : UNKNOWN_UF;
}

export function connectorOf(connection: OcmConnection): ConnectorType {
  const typeId = connection.ConnectionTypeID ?? connection.ConnectionType?.ID;
  if (typeof typeId === 'number' && CONNECTOR_BY_TYPE_ID[typeId]) {
    return CONNECTOR_BY_TYPE_ID[typeId];
  }
  const title = connection.ConnectionType?.Title ?? '';
  const isType2 = /type\s*2|mennekes/i.test(title);
  if (/ccs/i.test(title) && isType2) {
    return 'CCS_2';
  }
  if (/chademo/i.test(title)) {
    return 'CHADEMO';
  }
  return isType2 ? 'TYPE_2' : 'OTHER';
}

function powerOf(connection: OcmConnection): number {
  const power = connection.PowerKW;
  return typeof power === 'number' && Number.isFinite(power) && power > 0
    ? power
    : 0;
}

export function mainConnection(poi: OcmPoi): {
  connector: ConnectorType;
  maxPowerKw: number;
} {
  const connections = (poi.Connections ?? []).map((connection) => ({
    connector: connectorOf(connection),
    powerKw: powerOf(connection),
  }));
  if (connections.length === 0) {
    return { connector: 'OTHER', maxPowerKw: DEFAULT_POWER_KW.OTHER };
  }
  const [main] = [...connections].sort(
    (a, b) =>
      b.powerKw - a.powerKw ||
      CONNECTOR_PRIORITY.indexOf(a.connector) -
        CONNECTOR_PRIORITY.indexOf(b.connector),
  );
  const maxPowerKw =
    main.powerKw > 0
      ? Math.min(Math.round(main.powerKw * 100) / 100, MAX_POWER_KW)
      : DEFAULT_POWER_KW[main.connector];
  return { connector: main.connector, maxPowerKw };
}

export function isOperational(poi: OcmPoi): boolean {
  if (typeof poi.StatusType?.IsOperational === 'boolean') {
    return poi.StatusType.IsOperational;
  }
  return OPERATIONAL_STATUS_IDS.has(poi.StatusTypeID ?? -1);
}

export function operatorKeyOf(
  poi: OcmPoi,
  uf: string,
): { key: string; name: string } {
  const operatorId = poi.OperatorInfo?.ID ?? poi.OperatorID ?? null;
  const title = poi.OperatorInfo?.Title?.trim();
  if (operatorId === null || UNKNOWN_OPERATOR_IDS.has(operatorId) || !title) {
    return { key: `public:${uf}`, name: `Rede pública · ${uf}` };
  }
  return { key: String(operatorId), name: title };
}

export function operatorTariff(key: string): DemoTariff {
  const hash = parseInt(
    createHash('sha1').update(`ocm-operator:${key}`).digest('hex').slice(0, 8),
    16,
  );
  return {
    id: deterministicId(`ocm-tariff:${key}`),
    utilityRateCents: UTILITY_RATE_CENTS,
    baseRateCents: MIN_BASE_RATE_CENTS + (hash % BASE_RATE_SPREAD_CENTS),
    accessFeeCents: 0,
    idleFeeCentsPerMinute: 20 + (hash % 16),
    idleFeeCapCents: 2500 + (hash % 4) * 500,
    gracePeriodMinutes: [5, 10, 15][hash % 3],
  };
}

function hasCoordinates(poi: OcmPoi): boolean {
  const latitude = poi.AddressInfo?.Latitude;
  const longitude = poi.AddressInfo?.Longitude;
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

export function buildOcmNetwork(
  pois: OcmPoi[],
  mediaBaseUrl = DEFAULT_MEDIA_BASE_URL,
): OcmNetwork {
  const operators = new Map<string, OcmOperator>();
  const unique = new Map<number, OcmPoi>();
  for (const poi of pois) {
    if (!unique.has(poi.ID)) {
      unique.set(poi.ID, poi);
    }
  }
  const sorted = [...unique.values()]
    .filter(hasCoordinates)
    .sort((a, b) => a.ID - b.ID);
  const points = sorted.map((poi, index): OcmPoint => {
    const uf = ufOf(poi);
    const { key, name } = operatorKeyOf(poi, uf);
    let operator = operators.get(key);
    if (!operator) {
      operator = {
        id: deterministicId(`ocm-operator:${key}`),
        key,
        name,
        tariff: operatorTariff(key),
      };
      operators.set(key, operator);
    }
    const { connector, maxPowerKw } = mainConnection(poi);
    const title = poi.AddressInfo?.Title?.trim();
    return {
      id: deterministicId(`ocm-point:${poi.ID}`),
      externalId: String(poi.ID),
      organizationId: operator.id,
      code: `OCM-${poi.ID}`,
      name: title || `Eletroposto OCM ${poi.ID}`,
      uf,
      latitude: poi.AddressInfo?.Latitude ?? 0,
      longitude: poi.AddressInfo?.Longitude ?? 0,
      maxPowerKw,
      isOnline: isOperational(poi),
      photoUrl: pointPhotoUrl(
        mediaBaseUrl,
        NETWORK_POINT_PHOTOS[index % NETWORK_POINT_PHOTOS.length],
      ),
      charger: {
        id: deterministicId(`ocm-charger:${poi.ID}`),
        serialNumber: `GW-OCM-${poi.ID}`,
        vendor:
          maxPowerKw >= DC_MIN_POWER_KW
            ? DEMO_DC_CHARGER_VENDOR
            : DEMO_CHARGER_VENDOR,
        connector,
      },
    };
  });
  return { operators: [...operators.values()], points };
}

export function countByUf(
  points: Pick<OcmPoint, 'uf' | 'isOnline'>[],
): { uf: string; total: number; online: number }[] {
  const counts = new Map<string, { total: number; online: number }>();
  for (const point of points) {
    const count = counts.get(point.uf) ?? { total: 0, online: 0 };
    count.total++;
    if (point.isOnline) {
      count.online++;
    }
    counts.set(point.uf, count);
  }
  return [...counts.entries()]
    .map(([uf, count]) => ({ uf, ...count }))
    .sort((a, b) => b.total - a.total || a.uf.localeCompare(b.uf));
}

function batches<T>(items: T[], size = WRITE_BATCH_SIZE): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}

export async function writeOcmNetwork(
  prisma: Pick<
    PrismaClient,
    'organization' | 'tariff' | 'chargePoint' | 'charger' | '$executeRaw'
  >,
  network: OcmNetwork,
): Promise<OcmWriteResult> {
  for (const operator of network.operators) {
    const data = { name: operator.name, type: 'COMMERCIAL' as const };
    await prisma.organization.upsert({
      where: { id: operator.id },
      update: data,
      create: { ...data, id: operator.id },
    });
    await upsertTariff(prisma, operator.id, null, operator.tariff);
  }

  let created = 0;
  let updated = 0;
  for (const batch of batches(network.points)) {
    const inserted = await prisma.chargePoint.createMany({
      data: batch.map((point) => ({
        id: point.id,
        organizationId: point.organizationId,
        code: point.code,
        name: point.name,
        type: 'COMMERCIAL' as const,
        latitude: point.latitude,
        longitude: point.longitude,
        maxPowerKw: point.maxPowerKw,
        isOnline: point.isOnline,
        photoUrl: point.photoUrl,
        source: 'OCM' as const,
        externalId: point.externalId,
      })),
      skipDuplicates: true,
    });
    created += inserted.count;
    await prisma.charger.createMany({
      data: batch.map((point) => ({
        id: point.charger.id,
        chargePointId: point.id,
        vendor: point.charger.vendor,
        serialNumber: point.charger.serialNumber,
        connector: point.charger.connector,
      })),
      skipDuplicates: true,
    });
    const values = Prisma.join(
      batch.map(
        (point) =>
          Prisma.sql`(${point.externalId}, ${point.latitude}::float8, ${point.longitude}::float8, ${point.isOnline}::boolean)`,
      ),
    );
    updated += await prisma.$executeRaw`
      UPDATE "ChargePoint" AS cp
      SET "latitude" = v."latitude", "longitude" = v."longitude", "isOnline" = v."isOnline", "updatedAt" = NOW()
      FROM (VALUES ${values}) AS v("externalId", "latitude", "longitude", "isOnline")
      WHERE cp."source" = 'OCM' AND cp."externalId" = v."externalId"
        AND (cp."latitude" <> v."latitude" OR cp."longitude" <> v."longitude" OR cp."isOnline" <> v."isOnline")
    `;
  }
  return { operators: network.operators.length, created, updated };
}
