import {
  boxAround,
  centerOf,
  clusterCellDegrees,
  parseBoundingBox,
} from './geo.js';

describe('parseBoundingBox', () => {
  it('reads minLng,minLat,maxLng,maxLat', () => {
    expect(parseBoundingBox('-46.75,-23.65,-46.55,-23.45')).toEqual({
      minLng: -46.75,
      minLat: -23.65,
      maxLng: -46.55,
      maxLat: -23.45,
    });
    expect(parseBoundingBox(' -74, -34 , -34, 6')).toEqual({
      minLng: -74,
      minLat: -34,
      maxLng: -34,
      maxLat: 6,
    });
  });

  it('rejects malformed, inverted or out of range boxes', () => {
    expect(parseBoundingBox('-46.75,-23.65,-46.55')).toBeNull();
    expect(parseBoundingBox('a,b,c,d')).toBeNull();
    expect(parseBoundingBox('-46.55,-23.65,-46.75,-23.45')).toBeNull();
    expect(parseBoundingBox('-46.75,-23.45,-46.55,-23.65')).toBeNull();
    expect(parseBoundingBox('-181,-23.65,-46.55,-23.45')).toBeNull();
    expect(parseBoundingBox('-46.75,-91,-46.55,-23.45')).toBeNull();
    expect(parseBoundingBox('1e2,0,2,1')).toBeNull();
  });
});

describe('geo helpers', () => {
  it('finds the center of a box', () => {
    expect(
      centerOf({ minLng: -47, minLat: -24, maxLng: -46, maxLat: -23 }),
    ).toEqual({ latitude: -23.5, longitude: -46.5 });
  });

  it('builds a box that covers a radius, wider in longitude away from the equator', () => {
    const box = boxAround({ latitude: -23.5505, longitude: -46.6333 }, 25);

    expect(box.maxLat - box.minLat).toBeCloseTo(0.449, 3);
    expect(box.maxLng - box.minLng).toBeCloseTo(0.49, 2);
    expect(centerOf(box).latitude).toBeCloseTo(-23.5505, 6);
  });

  it('halves the cluster cell at each zoom level', () => {
    expect(clusterCellDegrees(0)).toBe(90);
    expect(clusterCellDegrees(1)).toBe(45);
    expect(clusterCellDegrees(9)).toBeCloseTo(0.17578125, 8);
  });
});
