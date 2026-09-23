export const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SAO_PAULO_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
});

export interface LocalTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
}

export function toSaoPauloTime(date: Date): LocalTime {
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    dayOfWeek: WEEKDAYS.indexOf(parts.weekday),
  };
}

const SAO_PAULO_UTC_OFFSET = '-03:00';

export interface MonthRange {
  year: number;
  month: number;
  start: Date;
  end: Date;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function saoPauloDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  return new Date(
    `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00.000${SAO_PAULO_UTC_OFFSET}`,
  );
}

export function saoPauloMonth(year: number, month: number): MonthRange {
  const next =
    month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return {
    year,
    month,
    start: saoPauloDate(year, month, 1),
    end: saoPauloDate(next.year, next.month, 1),
  };
}

export function saoPauloMonthOf(date: Date): MonthRange {
  const local = toSaoPauloTime(date);
  return saoPauloMonth(local.year, local.month);
}

export function formatMonth(range: Pick<MonthRange, 'year' | 'month'>): string {
  return `${range.year}-${pad(range.month)}`;
}
