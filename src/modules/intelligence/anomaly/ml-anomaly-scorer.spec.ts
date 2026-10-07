import { MlHttpClient } from '../ml/ml-http-client.js';
import type { SessionFeatures } from './anomaly-scorer.port.js';
import { MlAnomalyScorer } from './ml-anomaly-scorer.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const FEATURES: SessionFeatures = {
  chargePointType: 'PRIVATE',
  startHour: 22,
  dayOfWeek: 1,
  energyKwh: 29,
  durationMinutes: 312,
  idleMinutes: 22,
  averagePowerKw: 5.58,
};

describe('MlAnomalyScorer', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let scorer: MlAnomalyScorer;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    scorer = new MlAnomalyScorer(
      new MlHttpClient({ baseUrl: 'https://ml.example.com', fetch: fetchMock }),
    );
  });

  it('scores the session features', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        score: 0.913_27,
        isAnomaly: true,
        modelVersion: 'iforest-1',
      }),
    );

    await expect(scorer.score(FEATURES)).resolves.toEqual({
      score: 0.9133,
      isAnomaly: true,
      modelVersion: 'iforest-1',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://ml.example.com/anomaly-score');
    expect(JSON.parse(init?.body as string)).toEqual(FEATURES);
  });

  it.each([
    ['an error status', () => jsonResponse(500, {})],
    ['a payload without score', () => jsonResponse(200, { isAnomaly: true })],
    [
      'a payload without the flag',
      () => jsonResponse(200, { score: 0.2, isAnomaly: 'no' }),
    ],
  ])('returns no score on %s', async (_case, response) => {
    fetchMock.mockResolvedValue(response());

    await expect(scorer.score(FEATURES)).resolves.toBeNull();
  });

  it('returns no score when the service is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(scorer.score(FEATURES)).resolves.toBeNull();
  });
});
