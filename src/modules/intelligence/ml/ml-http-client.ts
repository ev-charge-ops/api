export const ML_REQUEST_TIMEOUT_MS = 1500;

export interface MlHttpClientSettings {
  baseUrl: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export class MlRequestError extends Error {
  override readonly name = 'MlRequestError';
}

export class MlHttpClient {
  private readonly fetch: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(settings: MlHttpClientSettings) {
    this.fetch = settings.fetch ?? globalThis.fetch;
    this.baseUrl = settings.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = settings.timeoutMs ?? ML_REQUEST_TIMEOUT_MS;
  }

  async post(path: string, body: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new MlRequestError(
        `ML request to ${path} failed: ${String(error)}`,
      );
    }
    if (!response.ok) {
      throw new MlRequestError(
        `ML request to ${path} answered ${response.status}`,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new MlRequestError(`ML request to ${path} returned invalid JSON`);
    }
  }
}

export function mlDayOfWeek(sundayBasedDay: number): number {
  return (sundayBasedDay + 6) % 7;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
