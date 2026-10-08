import { type Box, type OcmPoi, UF_BOXES } from './ocm-network.js';

export const DEFAULT_OCM_API_URL = 'https://api.openchargemap.io/v3';

export interface OcmClientOptions {
  apiKey: string;
  maxResults: number;
  baseUrl?: string;
  fetch?: typeof fetch;
  log?: (message: string) => void;
  retryDelayMs?: number;
}

const MAX_SPLIT_DEPTH = 6;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export function ocmPoiUrl(
  baseUrl: string,
  box: Box,
  maxResults: number,
): string {
  const params = new URLSearchParams({
    output: 'json',
    countrycode: 'BR',
    maxresults: String(maxResults),
    compact: 'false',
    verbose: 'false',
    boundingbox: `(${box.maxLat},${box.minLng}),(${box.minLat},${box.maxLng})`,
  });
  return `${baseUrl.replace(/\/+$/, '')}/poi?${params.toString()}`;
}

export function splitBox(box: Box): Box[] {
  const midLat = (box.minLat + box.maxLat) / 2;
  const midLng = (box.minLng + box.maxLng) / 2;
  return [
    { minLat: box.minLat, maxLat: midLat, minLng: box.minLng, maxLng: midLng },
    { minLat: box.minLat, maxLat: midLat, minLng: midLng, maxLng: box.maxLng },
    { minLat: midLat, maxLat: box.maxLat, minLng: box.minLng, maxLng: midLng },
    { minLat: midLat, maxLat: box.maxLat, minLng: midLng, maxLng: box.maxLng },
  ];
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OcmClient {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;
  private readonly log: (message: string) => void;
  private readonly retryDelayMs: number;

  constructor(private readonly options: OcmClientOptions) {
    this.baseUrl = options.baseUrl ?? DEFAULT_OCM_API_URL;
    this.fetch = options.fetch ?? fetch;
    this.log = options.log ?? (() => undefined);
    this.retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  }

  async fetchBrazil(): Promise<OcmPoi[]> {
    const pois = new Map<number, OcmPoi>();
    for (const [uf, box] of Object.entries(UF_BOXES)) {
      const found = await this.fetchBox(box, 0);
      for (const poi of found) {
        pois.set(poi.ID, poi);
      }
      this.log(`Fetched ${found.length} POIs in the ${uf} bounding box`);
    }
    return [...pois.values()];
  }

  private async fetchBox(box: Box, depth: number): Promise<OcmPoi[]> {
    const pois = await this.request(
      ocmPoiUrl(this.baseUrl, box, this.options.maxResults),
    );
    if (pois.length < this.options.maxResults || depth >= MAX_SPLIT_DEPTH) {
      return pois;
    }
    const parts: OcmPoi[] = [];
    for (const part of splitBox(box)) {
      parts.push(...(await this.fetchBox(part, depth + 1)));
    }
    return parts;
  }

  private async request(url: string): Promise<OcmPoi[]> {
    for (let attempt = 1; ; attempt++) {
      const response = await this.fetch(url, {
        headers: {
          'X-API-Key': this.options.apiKey,
          Accept: 'application/json',
          'User-Agent': 'EVChargeOps-OCM-import/1.0',
        },
      });
      if (response.ok) {
        const body: unknown = await response.json();
        if (!Array.isArray(body)) {
          throw new Error('Open Charge Map returned an unexpected payload');
        }
        return body as OcmPoi[];
      }
      if (!RETRYABLE_STATUS.has(response.status) || attempt >= MAX_ATTEMPTS) {
        throw new Error(
          `Open Charge Map answered ${response.status} ${response.statusText}`,
        );
      }
      await wait(this.retryDelayMs * attempt);
    }
  }
}
