export const ROUTINE_TIME_ZONE = 'America/Argentina/Buenos_Aires';

export const WEEKDAYS = [
  { value: 1, label: 'Lunes', short: 'Lun' },
  { value: 2, label: 'Martes', short: 'Mar' },
  { value: 3, label: 'Miércoles', short: 'Mié' },
  { value: 4, label: 'Jueves', short: 'Jue' },
  { value: 5, label: 'Viernes', short: 'Vie' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
  { value: 7, label: 'Domingo', short: 'Dom' },
] as const;

export const DEFAULT_TRAINING_DAYS = [1, 3, 5, 6] as const;

export function weekdayLabel(value: number, short = false) {
  const day = WEEKDAYS.find((item) => item.value === value);
  return day ? (short ? day.short : day.label) : 'Día sin definir';
}

export function scheduleDate(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ROUTINE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const weekday =
    (
      { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<
        string,
        number
      >
    )[parts.weekday] ?? 1;
  const localDate = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
  );
  const weekStart = new Date(localDate);
  weekStart.setUTCDate(localDate.getUTCDate() - (weekday - 1));

  return {
    weekday,
    dateKey: isoDate(localDate),
    weekKey: isoDate(weekStart),
  };
}

export function daysUntilWeekday(fromWeekday: number, targetWeekday: number) {
  const distance = (targetWeekday - fromWeekday + 7) % 7;
  return distance === 0 ? 7 : distance;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function validDateKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}

export function calendarWeek(startsOn: string, dateKey: string, count: number) {
  const days = Math.floor(
    (Date.parse(`${dateKey}T12:00:00Z`) - Date.parse(`${startsOn}T12:00:00Z`)) /
      86400000,
  );
  return Math.max(0, Math.min(Math.max(0, count - 1), Math.floor(days / 7)));
}

/** An assignment remains available through the day the PF cancels it. */
export function cancellationEndsOn(now = new Date()) {
  const today = scheduleDate(now).dateKey;
  return new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
}
