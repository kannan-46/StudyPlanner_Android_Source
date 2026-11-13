import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  completeRevision,
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

export function useCompleteRevision() {
  const { revisions } = useApi();
  const qc = useQueryClient();
  return useMutation({
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
    onSettled: (_d, _e, v) => invalidateTopicData(qc, v.topicId),
  });
}

export function useUndoRevision() {
  const { revisions } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { topicId: string; revisionId: string }) =>
      revisions.undo(v.topicId, v.revisionId),
    onSettled: (_d, _e, v) => invalidateTopicData(qc, v.topicId),
  });
}

export function useSnoozeRevision() {
  const { revisions } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      topicId: string;
      revisionId: string;
      today: string;
      days: number;
    }) => revisions.snooze(v.topicId, v.revisionId, v.today, v.days),
    onSettled: (_d, _e, v) => invalidateTopicData(qc, v.topicId),
  });
}
