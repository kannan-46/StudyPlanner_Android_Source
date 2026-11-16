import { useCallback, useMemo } from 'react';
import { useMutationState, useQuery } from '@tanstack/react-query';
import type { AgendaItem, LocalDate } from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';
import { useLocalToday } from '../../shared/lib/useLocalToday';
import { placeInAgenda } from './cache';

type RevisionChange = {
  kind: 'complete' | 'undo' | 'snooze';
  topicId: string;
  revisionId: string;
  at: number;
  /** The row the change shows meanwhile (an Undo's restore, a snooze). */
  place?: AgendaItem;
};

/**
 * What a revision change still being saved shows in the agenda: a Done hides
 * its row, an Undo puts its row back, a Snooze shows its row moved.
 */
export type PendingOverlay =
  | { topicId: string; hide: string }
  | { topicId: string; place: AgendaItem };

/**
 * The latest pending revision change of each topic, as JSON (a stable value
 * for memo dependencies). A list refetched meanwhile (another topic's change
 * finishing, the app coming back) still has the old state on the server, so
 * these are laid over it until each change is answered: a hidden Done row
 * doesn't flash back, a restored or snoozed row doesn't vanish and return.
 */
function usePendingOverlays(): string {
  const changes = useMutationState({
    filters: { mutationKey: ['revision'], status: 'pending' },
    select: (m): RevisionChange => {
      const v = m.state.variables as {
        topicId: string;
        revisionId: string;
        restore?: AgendaItem;
      };
      const k = m.options.mutationKey?.[1];
      const kind = k === 'undo' || k === 'snooze' ? k : 'complete';
      const ctx = m.state.context as { placed?: AgendaItem } | undefined;
      return {
        kind,
        topicId: v.topicId,
        revisionId: v.revisionId,
        at: m.state.submittedAt,
        place:
          kind === 'undo' ? v.restore : kind === 'snooze' ? ctx?.placed : undefined,
      };
    },
  });
  const latest = new Map<string, RevisionChange>();
  for (const c of changes) {
    const prev = latest.get(c.topicId);
    if (!prev || c.at >= prev.at) latest.set(c.topicId, c);
  }
  const overlays: PendingOverlay[] = [];
  for (const c of [...latest.values()].sort((a, b) =>
    a.topicId < b.topicId ? -1 : a.topicId > b.topicId ? 1 : 0,
  )) {
    if (c.kind === 'complete') {
      overlays.push({ topicId: c.topicId, hide: c.revisionId });
    } else if (c.place) {
      overlays.push({ topicId: c.topicId, place: c.place });
    }
  }
  return overlays.length ? JSON.stringify(overlays) : '';
}

/** `items` (cached under `key`) with the pending changes laid over them. */
export function applyOverlays(
  items: AgendaItem[],
  key: readonly unknown[],
  overlays: PendingOverlay[],
): AgendaItem[] {
  let out = items;
  for (const o of overlays) {
    if ('hide' in o) {
      out = out.filter(
        i => !(i.topicId === o.topicId && i.revisionId === o.hide),
      );
    } else {
      out = placeInAgenda(out, key, o.topicId, o.place);
    }
  }
  return out;
}

/**
 * Agenda from `today` for `days` days. `today` defaults to the phone's date,
 * kept current across midnight, so the query moves to the new day by itself.
 */
export function useAgenda(days = 30, today?: LocalDate) {
  const { agenda } = useApi();
  const localToday = useLocalToday();
  const day = today ?? localToday;
  const pending = usePendingOverlays();
  const overlays = useMemo<PendingOverlay[]>(
    () => (pending ? (JSON.parse(pending) as PendingOverlay[]) : []),
    [pending],
  );
  const select = useCallback(
    (items: AgendaItem[]) =>
      overlays.length
        ? applyOverlays(items, queryKeys.agenda(day, days), overlays)
        : items,
    [overlays, day, days],
  );
  return useQuery({
    queryKey: queryKeys.agenda(day, days),
    queryFn: () => agenda.get(day, days),
    select,
  });
}
