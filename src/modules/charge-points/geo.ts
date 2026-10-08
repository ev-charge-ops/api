import { registerDecorator, type ValidationOptions } from 'class-validator';

export interface BoundingBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export const SAO_PAULO: Coordinates = {
  latitude: -23.5505,
  longitude: -46.6333,
};

export const KM_PER_DEGREE = 111.32;
const DEGREES_TO_RADIANS = Math.PI / 180;
const WORLD_DEGREES = 360;
const CELLS_PER_TILE = 4;
const NUMBER = /^-?\d+(\.\d+)?$/;

export function parseBoundingBox(value: string): BoundingBox | null {
  const parts = value.split(',').map((part) => part.trim());
  if (parts.length !== 4 || parts.some((part) => !NUMBER.test(part))) {
    return null;
  }
  const [minLng, minLat, maxLng, maxLat] = parts.map(Number);
  const valid =
    minLng >= -180 &&
    maxLng <= 180 &&
    minLat >= -90 &&
    maxLat <= 90 &&
    minLng <= maxLng &&
    minLat <= maxLat;
  return valid ? { minLng, minLat, maxLng, maxLat } : null;
}

export function centerOf(box: BoundingBox): Coordinates {
  return {
    latitude: (box.minLat + box.maxLat) / 2,
    longitude: (box.minLng + box.maxLng) / 2,
  };
}

export function boxAround(origin: Coordinates, radiusKm: number): BoundingBox {
  const latDelta = radiusKm / KM_PER_DEGREE;
  const lngDelta =
    radiusKm /
    (KM_PER_DEGREE * Math.max(longitudeScale(origin.latitude), 0.01));
  return {
    minLat: origin.latitude - latDelta,
    maxLat: origin.latitude + latDelta,
    minLng: origin.longitude - lngDelta,
    maxLng: origin.longitude + lngDelta,
  };
}

export function longitudeScale(latitude: number): number {
  return Math.cos(latitude * DEGREES_TO_RADIANS);
}

export function clusterCellDegrees(zoom: number): number {
  return WORLD_DEGREES / 2 ** zoom / CELLS_PER_TILE;
}

export function IsBoundingBox(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isBoundingBox',
      target: target.constructor,
      propertyName: propertyName as string,
      options: {
        message: `${String(propertyName)} must be minLng,minLat,maxLng,maxLat with valid coordinates and min <= max`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && parseBoundingBox(value) !== null;
        },
      },
    });
  };
}
