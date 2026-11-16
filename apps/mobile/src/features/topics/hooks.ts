import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  TopicCreateInput,
  TopicListQuery,
  TopicUpdateInput,
  TopicView,
} from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';
import { invalidateTopicData } from '../../shared/api/invalidate';

export function useTopics(
  query: TopicListQuery = {},
  opts: {
    /** Keep showing the last list while a changed search/filter loads. */
    keepPrevious?: boolean;
    /** False to hold the request (default true). */
    enabled?: boolean;
  } = {},
) {
  const { topics } = useApi();
  return useQuery({
    queryKey: queryKeys.topics(query),
    queryFn: () => topics.list(query),
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
    enabled: opts.enabled ?? true,
  });
}

/** The topic as any loaded topic list holds it (lists carry full topics). */
export function topicFromLists(
  qc: QueryClient,
  id: string,
): TopicView | undefined {
  return qc
    .getQueriesData<TopicView[]>({ queryKey: ['topics'] })
    .flatMap(([, d]) => (Array.isArray(d) ? d : []))
    .find(t => t.id === id);
}

export function useTopic(
  id: string,
  opts: {
    /**
     * Show the copy from a loaded topic list straight away while the topic
     * itself loads (for screens that only display it; a form should start
     * from the server copy).
     */
    fromList?: boolean;
  } = {},
) {
  const { topics } = useApi();
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.topic(id),
    queryFn: () => topics.get(id),
    placeholderData: opts.fromList ? () => topicFromLists(qc, id) : undefined,
  });
}

// The mutations below refresh the lists in the background: TanStack Query
// waits for a promise returned from onSettled, and waiting for every list to
// reload kept the Save spinner going (about 3 s offline, with retries).

export function useCreateTopic() {
  const { topics } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TopicCreateInput) => topics.create(input),
    onSuccess: res => {
      if (res?.id) qc.setQueryData(queryKeys.topic(res.id), res);
    },
    onSettled: () => {
      invalidateTopicData(qc);
    },
  });
}

export function useUpdateTopic() {
  const { topics } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: TopicUpdateInput }) =>
      topics.update(v.id, v.patch),
    onSuccess: res => {
      if (res?.id) qc.setQueryData(queryKeys.topic(res.id), res);
    },
    onSettled: (_d, _e, v) => {
      invalidateTopicData(qc, v.id);
    },
  });
}

export function useDeleteTopic() {
  const { topics } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => topics.remove(id),
    // The deleted topic is marked stale, not refetched (that would be a 404).
    onSettled: (_d, _e, id) => {
      invalidateTopicData(qc, id, { deleted: true });
    },
  });
}
