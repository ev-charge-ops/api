import { toSaoPauloTime } from '../../../common/time/sao-paulo-time.js';

export function formatSaoPauloDateTime(date: Date): string {
  const time = toSaoPauloTime(date);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(time.day)}/${pad(time.month)}/${time.year} às ${pad(time.hour)}:${pad(time.minute)}`;
}
