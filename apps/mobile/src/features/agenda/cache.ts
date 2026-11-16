import type { QueryClient, QueryKey } from '@tanstack/react-query';
import {
  addDays,
  compareDates,
  type AgendaItem,
  type LocalDate,
  type TopicView,
} from '@planner/shared';

/**
 * `items` (cached under agenda `key` = ['agenda', today, days]) with topic
 * `topicId` showing `item` instead of what it showed before: no row when
 * `item` is null or falls after the range. The bucket is worked out against
 * the cache's own day and the row goes where the server would sort it.
 */
export function placeInAgenda(
  items: AgendaItem[],
  key: QueryKey,
  topicId: string,
  item: AgendaItem | null,
): AgendaItem[] {
  const rest = items.filter(i => i.topicId !== topicId);
  const [, day, days] = key as [string, LocalDate | undefined, unknown];
  if (!item || typeof day !== 'string' || typeof days !== 'number') {
    return rest;
  }
  if (compareDates(item.dueOn, addDays(day, days)) > 0) return rest;
  const c = compareDates(item.dueOn, day);
  const placed: AgendaItem = {
    ...item,
    bucket: c < 0 ? 'overdue' : c === 0 ? 'today' : 'upcoming',
  };
  const after = (i: AgendaItem) => {
    const d = compareDates(i.dueOn, placed.dueOn);
    if (d !== 0) return d > 0;
    return (
      i.topicName.localeCompare(placed.topicName, 'en', {
        sensitivity: 'base',
      }) > 0
    );
  };
  const at = rest.findIndex(after);
  rest.splice(at < 0 ? rest.length : at, 0, placed);
  return rest;
}

/** Applies placeInAgenda to every cached agenda. */
export function placeInAllAgendas(
  qc: QueryClient,
  topicId: string,
  item: AgendaItem | null,
): void {
  for (const [key, data] of qc.getQueriesData<AgendaItem[]>({
    queryKey: ['agenda'],
  })) {
    if (data) qc.setQueryData(key, placeInAgenda(data, key, topicId, item));
  }
}

/**
 * The agenda row of topic `t`'s next pending revision, with the subject
 * details taken from `base` (an earlier row of the same topic). Null when the
 * topic has nothing left to revise.
 */
export function nextAgendaItem(
  t: TopicView,
  base: AgendaItem,
): AgendaItem | null {
  if (t.status !== 'active') return null;
  const rev = [...t.revisions]
    .sort((a, b) => a.step - b.step)
    .find(r => r.doneOn === null);
  if (!rev) return null;
  return {
    ...base,
    topicName: t.name,
    revisionId: rev.id,
    step: rev.step,
    totalSteps: t.intervals.length,
    dueOn: rev.dueOn,
  };
}
