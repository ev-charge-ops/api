import { MlHttpClient } from '../ml/ml-http-client.js';
import type { DemandFactorInput } from './demand-factor.provider.js';
import { MlDemandFactorProvider } from './ml-demand-factor.provider.js';
import { RuleDemandFactorProvider } from './rule-demand-factor.provider.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const INPUT: DemandFactorInput = {
  at: new Date('2026-10-07T19:30:00-03:00'),
  chargePointType: 'COMMERCIAL',
  occupancyRatio: 0.33,
  queueLength: 1,
};

describe('MlDemandFactorProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let provider: MlDemandFactorProvider;

  function createProvider(timeoutMs?: number): MlDemandFactorProvider {
    return new MlDemandFactorProvider(
      new MlHttpClient({
        baseUrl: 'https://ml.example.com/',
        fetch: fetchMock,
        timeoutMs,
      }),
      new RuleDemandFactorProvider(),
    );
  }

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    provider = createProvider();
  });

  it('asks the model with the demand features', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { factor: 1.3456, modelVersion: 'gbr-2026-10-01' }),
    );

    await expect(provider.getFactor(INPUT)).resolves.toEqual({
      factor: 1.35,
      level: 'PEAK',
      source: 'MODEL',
      modelVersion: 'gbr-2026-10-01',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://ml.example.com/demand-factor');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      hour: 19,
      dayOfWeek: 2,
      occupancyRatio: 0.33,
      queueLength: 1,
      chargePointType: 'COMMERCIAL',
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('counts the days of the week from Monday like the model', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { factor: 1 }));

    await provider.getFactor({
      ...INPUT,
      at: new Date('2026-10-11T10:00:00-03:00'),
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toMatchObject({ dayOfWeek: 6 });
  });

  it.each([
    [0.8, 'OFF_PEAK'],
    [1, 'NORMAL'],
    [1.2, 'NORMAL'],
    [1.21, 'PEAK'],
  ])('labels a model factor of %s as %s', async (factor, level) => {
    fetchMock.mockResolvedValue(jsonResponse(200, { factor }));

    await expect(provider.getFactor(INPUT)).resolves.toMatchObject({
      level,
      modelVersion: null,
    });
  });

  it.each([
    ['an error status', () => jsonResponse(503, { detail: 'down' })],
    ['an unusable factor', () => jsonResponse(200, { factor: 12 })],
    ['a missing factor', () => jsonResponse(200, { modelVersion: 'x' })],
    ['invalid JSON', () => new Response('<html>', { status: 200 })],
  ])('falls back to the rules on %s', async (_case, response) => {
    fetchMock.mockResolvedValue(response());

    await expect(provider.getFactor(INPUT)).resolves.toEqual({
      factor: 1.5,
      level: 'PEAK',
      source: 'RULE',
      modelVersion: null,
    });
  });

  it('falls back to the rules when the network fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(provider.getFactor(INPUT)).resolves.toMatchObject({
      source: 'RULE',
    });
  });

  it('gives up after the timeout', async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          );
        }),
    );
    provider = createProvider(20);

    await expect(provider.getFactor(INPUT)).resolves.toMatchObject({
      source: 'RULE',
    });
  });
});
