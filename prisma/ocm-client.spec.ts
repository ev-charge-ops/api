import { OcmClient, ocmPoiUrl, splitBox } from './ocm-client.js';
import { UF_BOXES } from './ocm-network.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function boxOf(url: string) {
  const match = /boundingbox=([^&]+)/.exec(url);
  const [maxLat, minLng, minLat, maxLng] = decodeURIComponent(match?.[1] ?? '')
    .replace(/[()]/g, '')
    .split(',')
    .map(Number);
  return { minLat, maxLat, minLng, maxLng };
}

describe('ocmPoiUrl', () => {
  it('asks for Brazilian POIs inside the box with the result limit', () => {
    const url = new URL(
      ocmPoiUrl(
        'https://api.openchargemap.io/v3/',
        { minLat: -25.4, maxLat: -19.7, minLng: -53.2, maxLng: -44.1 },
        5000,
      ),
    );

    expect(url.origin + url.pathname).toBe(
      'https://api.openchargemap.io/v3/poi',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      output: 'json',
      countrycode: 'BR',
      maxresults: '5000',
      compact: 'false',
      verbose: 'false',
      boundingbox: '(-19.7,-53.2),(-25.4,-44.1)',
    });
  });
});

describe('splitBox', () => {
  it('splits a box in four quadrants', () => {
    expect(splitBox({ minLat: 0, maxLat: 2, minLng: 10, maxLng: 14 })).toEqual([
      { minLat: 0, maxLat: 1, minLng: 10, maxLng: 12 },
      { minLat: 0, maxLat: 1, minLng: 12, maxLng: 14 },
      { minLat: 1, maxLat: 2, minLng: 10, maxLng: 12 },
      { minLat: 1, maxLat: 2, minLng: 12, maxLng: 14 },
    ]);
  });
});

describe('OcmClient', () => {
  it('queries every UF box with the API key and merges duplicates', async () => {
    const fetch = vi.fn((url: string) => {
      const box = boxOf(url);
      return Promise.resolve(
        json(
          box.minLat === UF_BOXES.SP.minLat && box.minLng === UF_BOXES.SP.minLng
            ? [{ ID: 1 }, { ID: 2 }]
            : [{ ID: 2 }],
        ),
      );
    });
    const client = new OcmClient({
      apiKey: 'ocm-key',
      maxResults: 100,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    const pois = await client.fetchBrazil();

    expect(pois.map((poi) => poi.ID).sort((a, b) => a - b)).toEqual([1, 2]);
    expect(fetch).toHaveBeenCalledTimes(Object.keys(UF_BOXES).length);
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'X-API-Key': 'ocm-key' });
  });

  it('splits a box that reaches the result limit', async () => {
    let nextId = 0;
    const fetch = vi.fn((url: string) => {
      const box = boxOf(url);
      const full = box.maxLat - box.minLat > 3;
      return Promise.resolve(
        json(Array.from({ length: full ? 2 : 1 }, () => ({ ID: ++nextId }))),
      );
    });
    const client = new OcmClient({
      apiKey: 'ocm-key',
      maxResults: 2,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await client.fetchBrazil();

    const spCalls = fetch.mock.calls
      .map(([url]) => boxOf(url))
      .filter(
        (box) =>
          box.minLng >= UF_BOXES.SP.minLng &&
          box.maxLng <= UF_BOXES.SP.maxLng &&
          box.minLat >= UF_BOXES.SP.minLat &&
          box.maxLat <= UF_BOXES.SP.maxLat,
      );
    expect(spCalls.length).toBeGreaterThan(1);
  });

  it('retries throttled requests and fails on other errors', async () => {
    const throttled = vi
      .fn()
      .mockResolvedValueOnce(json({}, 429))
      .mockImplementation(() => Promise.resolve(json([])));
    await new OcmClient({
      apiKey: 'ocm-key',
      maxResults: 10,
      retryDelayMs: 0,
      fetch: throttled as unknown as typeof globalThis.fetch,
    }).fetchBrazil();
    expect(throttled).toHaveBeenCalledTimes(Object.keys(UF_BOXES).length + 1);

    const forbidden = vi.fn().mockResolvedValue(json({}, 403));
    await expect(
      new OcmClient({
        apiKey: 'bad-key',
        maxResults: 10,
        retryDelayMs: 0,
        fetch: forbidden as unknown as typeof globalThis.fetch,
      }).fetchBrazil(),
    ).rejects.toThrow(/403/);
  });
});
