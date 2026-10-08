export const DEFAULT_MEDIA_BASE_URL = 'https://app.evchargeops.com.br/media';

export const NETWORK_POINT_PHOTOS = [
  'garage-a.webp',
  'garage-b.webp',
  'charger-wall.webp',
  'charger-wall-b.webp',
];

export function pointPhotoUrl(mediaBaseUrl: string, file: string): string {
  return `${mediaBaseUrl.replace(/\/+$/, '')}/points/${file}`;
}
