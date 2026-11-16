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

/**
 * @deprecated Old Topics-list wording ("in 4 days", "3 days overdue"). Use
 * dueStatus() (or the DueText component) so every screen words a due date
 * the same way.
 */
export function relativeDay(d: LocalDate, today: LocalDate): string {
  const n = daysBetween(today, d);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 0) return `${-n} ${n === -1 ? 'day' : 'days'} overdue`;
  return `in ${n} days`;
}

/** How soon a pending revision is due. */
export type DueTone = 'overdue' | 'today' | 'upcoming';

export type DueStatus = {
  text: string;
  /** Overdue revisions are drawn in the danger colour, bold. */
  overdue: boolean;
  tone: DueTone;
};

/**
 * Plain status of a pending revision, the same on every screen:
 * "Overdue by 3 days", "Due today", "Due tomorrow" or "In 4 days, 18 Nov".
 */
export function dueStatus(due: LocalDate, today: LocalDate): DueStatus {
  const n = daysBetween(today, due);
  if (n < 0) {
    return {
      text: `Overdue by ${-n} ${n === -1 ? 'day' : 'days'}`,
      overdue: true,
      tone: 'overdue',
    };
  }
  if (n === 0) return { text: 'Due today', overdue: false, tone: 'today' };
  if (n === 1) {
    return { text: 'Due tomorrow', overdue: false, tone: 'upcoming' };
  }
  return {
    text: `In ${n} days, ${formatDate(due, today)}`,
    overdue: false,
    tone: 'upcoming',
  };
}

/**
 * A day inside a sentence: "today", "tomorrow", "yesterday", else the date
 * ("20 Nov"). E.g. `Snoozed to ${dayLabel(to, today)}`.
 */
export function dayLabel(d: LocalDate, today: LocalDate): string {
  const n = daysBetween(today, d);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return formatDate(d, today);
}

/**
 * Like dayLabel, with "on" before a date: "today", "tomorrow", "on 20 Nov".
 * E.g. `Revision 1 done · next ${onDayLabel(next, today)}`.
 */
export function onDayLabel(d: LocalDate, today: LocalDate): string {
  const label = dayLabel(d, today);
  return /^\d/.test(label) ? `on ${label}` : label;
}

/** A finished revision: "Done today", "Done yesterday" or "Done 16 Nov". */
export function doneLabel(doneOn: LocalDate, today: LocalDate): string {
  return `Done ${dayLabel(doneOn, today)}`;
}

/** After a snooze: "Snoozed to tomorrow" or "Snoozed to 20 Nov". */
export function snoozedLabel(to: LocalDate, today: LocalDate): string {
  return `Snoozed to ${dayLabel(to, today)}`;
}

/**
 * A stored "HH:mm" time the way the phone shows times: "20:30" with a
 * 24-hour clock, "8:30 PM" with a 12-hour one.
 */
export function formatClockTime(time: string, use24Hour: boolean): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const h = Number(match[1]);
  if (use24Hour) return `${String(h).padStart(2, '0')}:${match[2]}`;
  return `${h % 12 || 12}:${match[2]} ${h < 12 ? 'AM' : 'PM'}`;
}
