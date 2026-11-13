import { daysBetween, localToday, type LocalDate } from '@planner/shared';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** '5 Nov'; adds the year when it is not the current year. */
export function formatDate(
  d: LocalDate,
  today: LocalDate = localToday(),
): string {
  const [y, m, day] = d.split('-').map(Number);
  const base = `${day} ${MONTHS[m - 1]}`;
  return y === Number(today.slice(0, 4)) ? base : `${base} ${y}`;
}

export function relativeDay(d: LocalDate, today: LocalDate): string {
  const n = daysBetween(today, d);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 0) return `${-n} ${n === -1 ? 'day' : 'days'} overdue`;
  return `in ${n} days`;
}
