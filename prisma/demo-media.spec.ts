import { DEFAULT_MEDIA_BASE_URL, pointPhotoUrl } from './demo-media.js';

describe('pointPhotoUrl', () => {
  it('builds absolute charge point photo urls under the media base url', () => {
    expect(pointPhotoUrl(DEFAULT_MEDIA_BASE_URL, 'garage-a.webp')).toBe(
      'https://app.evchargeops.com.br/media/points/garage-a.webp',
    );
    expect(pointPhotoUrl('http://localhost:5173/media/', 'garage-b.webp')).toBe(
      'http://localhost:5173/media/points/garage-b.webp',
    );
  });
});
