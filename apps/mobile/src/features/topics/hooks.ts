import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TopicCreateInput,
  TopicListQuery,
  TopicUpdateInput,
} from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';
import { invalidateTopicData } from '../../shared/api/invalidate';

export function useTopics(query: TopicListQuery = {}) {
  const { topics } = useApi();
  return useQuery({
    queryKey: queryKeys.topics(query),
    queryFn: () => topics.list(query),
  });
}

export function useTopic(id: string) {
  const { topics } = useApi();
  return useQuery({
    queryKey: queryKeys.topic(id),
    queryFn: () => topics.get(id),
  });
}

export function useCreateTopic() {
  const { topics } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TopicCreateInput) => topics.create(input),
    onSettled: () => invalidateTopicData(qc),
  });
}

export function useUpdateTopic() {
  const { topics } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: TopicUpdateInput }) =>
      topics.update(v.id, v.patch),
    onSettled: (_d, _e, v) => invalidateTopicData(qc, v.id),
  });
}

export function useDeleteTopic() {
  const { topics } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => topics.remove(id),
    onSettled: (_d, _e, id) => invalidateTopicData(qc, id),
  });
}
