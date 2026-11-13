/** A calendar date in `YYYY-MM-DD` form. Never a Date instant. */
export type LocalDate = string;

const DAY_MS = 86_400_000;
const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtc(date: LocalDate): number {
  const m = PATTERN.exec(date);
  if (!m) throw new RangeError(`Invalid LocalDate: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function fromUtc(ms: number): LocalDate {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string') return false;
  const m = PATTERN.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

export function compareDates(a: LocalDate, b: LocalDate): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whole days from `from` to `to` (to minus from). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Today's date from the device's local date fields. */
export function localToday(now: Date = new Date()): LocalDate {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1, 2)}-${pad(now.getDate(), 2)}`;
}

export function maxDate(a: LocalDate, b: LocalDate): LocalDate {
  return compareDates(a, b) >= 0 ? a : b;
}
