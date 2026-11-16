import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  completeRevision,
  undoRevision,
  type AgendaItem,
  type TopicView,
} from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';
import { invalidateTopicData } from '../../shared/api/invalidate';
import { nextAgendaItem, placeInAllAgendas } from '../agenda/cache';

interface CompleteVars {
  topicId: string;
  revisionId: string;
  doneOn: string;
}

export interface UndoVars {
  topicId: string;
  revisionId: string;
  /** The agenda row the Done removed; Undo puts it back straight away. */
  restore?: AgendaItem;
  /**
   * The Done this Undo takes back, when it was tapped before the Done was
   * saved. If that Done fails there is nothing to undo and no request is sent.
   */
  afterDone?: Promise<unknown>;
}

/** Keys of the optimistic revision changes (the agenda hides pending Dones). */
export const revisionKeys = {
  complete: ['revision', 'complete'] as const,
  undo: ['revision', 'undo'] as const,
};

/**
 * Revision changes of one topic run one after another (Done, then Undo), so
 * an Undo tapped while Done is still on its way can't reach the server first.
 */
const topicScope = (topicId?: string) =>
  topicId ? { id: `topic:${topicId}` } : undefined;

/**
 * True while another change of the same topic waits behind the one that is
 * finishing: that one decides what the lists show, so this one must not
 * overwrite them (or refetch a state that is about to change).
 */
function queuedBehind(qc: QueryClient, topicId: string): boolean {
  const id = `topic:${topicId}`;
  return (
    qc.getMutationCache().findAll({
      status: 'pending',
      predicate: m => m.options.scope?.id === id,
    }).length > 1
  );
}

/**
 * Refetch in the background: the mutation (and the snackbar waiting on it)
 * settles as soon as the server answers, not after every list reloads.
 */
const refreshAfter =
  (qc: QueryClient) => (_d: unknown, _e: unknown, v: { topicId: string }) => {
    if (queuedBehind(qc, v.topicId)) return;
    invalidateTopicData(qc, v.topicId).catch(() => {});
  };

const isTopic = (x: unknown): x is TopicView =>
  !!x && Array.isArray((x as TopicView).revisions);

export function useCompleteRevision(topicId?: string) {
  const { revisions } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: revisionKeys.complete,
    scope: topicScope(topicId),
    mutationFn: (v: CompleteVars) =>
      revisions.complete(v.topicId, v.revisionId, v.doneOn),
    onMutate: async v => {
      const topicKey = queryKeys.topic(v.topicId);
      await Promise.all([
        qc.cancelQueries({ queryKey: topicKey }),
        qc.cancelQueries({ queryKey: ['agenda'] }),
      ]);
      const prevTopic = qc.getQueryData<TopicView>(topicKey);
      const prevAgenda = qc.getQueriesData<AgendaItem[]>({
        queryKey: ['agenda'],
      });

      if (prevTopic) {
        try {
          const next = completeRevision(prevTopic, v.revisionId, v.doneOn);
          qc.setQueryData<TopicView>(topicKey, { ...prevTopic, ...next });
        } catch {
          // Not applicable locally; the server decides.
        }
      }
      qc.setQueriesData<AgendaItem[]>({ queryKey: ['agenda'] }, items =>
        items?.filter(
          i => !(i.topicId === v.topicId && i.revisionId === v.revisionId),
        ),
      );
      return { topicKey, prevTopic, prevAgenda };
    },
    onSuccess: (res, v, ctx) => {
      // The saved topic shows at once: its next revision takes the row's
      // place (under Coming up unless it is really due today).
      if (!isTopic(res) || queuedBehind(qc, v.topicId)) return;
      qc.setQueryData<TopicView>(ctx.topicKey, res);
      const base = ctx.prevAgenda
        .flatMap(([, items]) => items ?? [])
        .find(i => i.topicId === v.topicId);
      if (base) placeInAllAgendas(qc, v.topicId, nextAgendaItem(res, base));
    },
    onError: (_e, _v, ctx) => {
      if (!ctx) return;
      qc.setQueryData(ctx.topicKey, ctx.prevTopic);
      for (const [key, data] of ctx.prevAgenda) qc.setQueryData(key, data);
    },
    onSettled: refreshAfter(qc),
  });
}

export function useUndoRevision(topicId?: string) {
  const { revisions } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: revisionKeys.undo,
    scope: topicScope(topicId),
    mutationFn: async (v: UndoVars) => {
      if (v.afterDone) {
        const saved = await v.afterDone.then(
          () => true,
          () => false,
        );
        // The Done failed and was rolled back: already as Undo wants it.
        if (!saved) return undefined;
      }
      return revisions.undo(v.topicId, v.revisionId);
    },
    onMutate: async v => {
      const topicKey = queryKeys.topic(v.topicId);
      await Promise.all([
        qc.cancelQueries({ queryKey: topicKey }),
        qc.cancelQueries({ queryKey: ['agenda'] }),
      ]);
      const prevTopic = qc.getQueryData<TopicView>(topicKey);
      const prevAgenda = qc.getQueriesData<AgendaItem[]>({
        queryKey: ['agenda'],
      });
      if (prevTopic) {
        try {
          const next = undoRevision(prevTopic, v.revisionId);
          qc.setQueryData<TopicView>(topicKey, { ...prevTopic, ...next });
        } catch {
          // Not applicable locally; the server decides.
        }
      }
      if (v.restore) placeInAllAgendas(qc, v.topicId, v.restore);
      return { topicKey, prevTopic, prevAgenda };
    },
    onError: (_e, _v, ctx) => {
      if (!ctx) return;
      qc.setQueryData(ctx.topicKey, ctx.prevTopic);
      for (const [key, data] of ctx.prevAgenda) qc.setQueryData(key, data);
    },
    onSettled: refreshAfter(qc),
  });
}

export function useSnoozeRevision(topicId?: string) {
  const { revisions } = useApi();
  const qc = useQueryClient();
  return useMutation({
    scope: topicScope(topicId),
    mutationFn: (v: {
      topicId: string;
      revisionId: string;
      today: string;
      days: number;
    }) => revisions.snooze(v.topicId, v.revisionId, v.today, v.days),
    onSettled: refreshAfter(qc),
  });
}
