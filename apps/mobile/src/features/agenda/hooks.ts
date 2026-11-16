import { useCallback } from 'react';
import { useMutationState, useQuery } from '@tanstack/react-query';
import type { AgendaItem, LocalDate } from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';
import { useLocalToday } from '../../shared/lib/useLocalToday';

type RevisionChange = {
  undo: boolean;
  topicId: string;
  revisionId: string;
  at: number;
};

/**
 * "topicId:revisionId" of the revisions whose Done is still being saved (and
 * not taken back by a later Undo). A list refetched meanwhile (another Done
 * finishing, the app coming back) would still have them due, and the row
 * would flash back in; it stays hidden until the server answers.
 */
function usePendingDones(): string {
  const changes = useMutationState({
    filters: { mutationKey: ['revision'], status: 'pending' },
    select: (m): RevisionChange => {
      const v = m.state.variables as { topicId: string; revisionId: string };
      return {
        undo: m.options.mutationKey?.[1] === 'undo',
        topicId: v.topicId,
        revisionId: v.revisionId,
        at: m.state.submittedAt,
      };
    },
  });
  const latest = new Map<string, RevisionChange>();
  for (const c of changes) {
    const prev = latest.get(c.topicId);
    if (!prev || c.at >= prev.at) latest.set(c.topicId, c);
  }
  return [...latest.values()]
    .filter(c => !c.undo)
    .map(c => `${c.topicId}:${c.revisionId}`)
    .sort()
    .join(',');
}

/**
 * Agenda from `today` for `days` days. `today` defaults to the phone's date,
 * kept current across midnight, so the query moves to the new day by itself.
 */
export function useAgenda(days = 30, today?: LocalDate) {
  const { agenda } = useApi();
  const localToday = useLocalToday();
  const day = today ?? localToday;
  const pending = usePendingDones();
  const select = useCallback(
    (items: AgendaItem[]) => {
      if (!pending) return items;
      const hidden = new Set(pending.split(','));
      return items.filter(i => !hidden.has(`${i.topicId}:${i.revisionId}`));
    },
    [pending],
  );
  return useQuery({
    queryKey: queryKeys.agenda(day, days),
    queryFn: () => agenda.get(day, days),
    select,
  });
}
