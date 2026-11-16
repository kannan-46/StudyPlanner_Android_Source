import { daysBetween, localToday, type LocalDate } from '@planner/shared';
import { formatDate } from '../../shared/lib/format';

/** Longest topic name repeated in the "added" snackbar before it is cut. */
export const ADDED_NAME_MAX = 40;

/** Cuts a long name to `max` characters with "…" so a message stays short. */
export function shortName(name: string, max = ADDED_NAME_MAX): string {
  const chars = Array.from(name.trim());
  return chars.length <= max
    ? chars.join('')
    : `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`;
}

/**
 * When a newly added topic's first revision falls, never showing a past date
 * as if it were coming up (a topic studied weeks ago is due straight away):
 * "first revision is due now", "first revision is due today",
 * "first revision tomorrow" or "first revision 20 Nov".
 */
export function firstRevisionText(
  due: LocalDate | null | undefined,
  today: LocalDate = localToday(),
): string {
  if (!due) return 'first revision scheduled';
  const n = daysBetween(today, due);
  if (n < 0) return 'first revision is due now';
  if (n === 0) return 'first revision is due today';
  if (n === 1) return 'first revision tomorrow';
  return `first revision ${formatDate(due, today)}`;
}

/** "Thyroid added — first revision 20 Nov", with a long name shortened. */
export function topicAddedMessage(
  name: string,
  due: LocalDate | null | undefined,
  today: LocalDate = localToday(),
): string {
  return `${shortName(name)} added — ${firstRevisionText(due, today)}`;
}
