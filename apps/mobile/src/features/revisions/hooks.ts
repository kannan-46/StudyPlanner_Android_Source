import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  completeRevision,
  undoRevision,
  type AgendaItem,
  type TopicView,
} from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';
import { invalidateTopicData } from '../../shared/api/invalidate';

interface CompleteVars {
  topicId: string;
  revisionId: string;
  doneOn: string;
}

/**
 * Revision changes of one topic run one after another (Done, then Undo), so
 * an Undo tapped while Done is still on its way can't reach the server first.
 */
const topicScope = (topicId?: string) =>
  topicId ? { id: `topic:${topicId}` } : undefined;

/**
 * Refetch in the background: the mutation (and the snackbar waiting on it)
 * settles as soon as the server answers, not after every list reloads.
 */
const refreshAfter =
  (qc: ReturnType<typeof useQueryClient>) =>
  (_d: unknown, _e: unknown, v: { topicId: string }) => {
    invalidateTopicData(qc, v.topicId).catch(() => {});
  };

export function useCompleteRevision(topicId?: string) {
  const { revisions } = useApi();
  const qc = useQueryClient();
  return useMutation({
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
    scope: topicScope(topicId),
    mutationFn: (v: { topicId: string; revisionId: string }) =>
      revisions.undo(v.topicId, v.revisionId),
    onMutate: async v => {
      const topicKey = queryKeys.topic(v.topicId);
      await qc.cancelQueries({ queryKey: topicKey });
      const prevTopic = qc.getQueryData<TopicView>(topicKey);
      if (prevTopic) {
        try {
          const next = undoRevision(prevTopic, v.revisionId);
          qc.setQueryData<TopicView>(topicKey, { ...prevTopic, ...next });
        } catch {
          // Not applicable locally; the server decides.
        }
      }
      return { topicKey, prevTopic };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.topicKey, ctx.prevTopic);
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
