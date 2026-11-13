import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  localToday,
  type MockTestInput,
  type MockTestUpdate,
} from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';
import { invalidateMockTestData } from '../../shared/api/invalidate';

export function useStats() {
  const { stats } = useApi();
  const today = localToday();
  return useQuery({
    queryKey: queryKeys.stats(today),
    queryFn: () => stats.get(today),
  });
}

export function useMockTests() {
  const { mockTests } = useApi();
  return useQuery({
    queryKey: queryKeys.mockTests,
    queryFn: () => mockTests.list(),
  });
}

export function useCreateMockTest() {
  const { mockTests } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MockTestInput) => mockTests.create(input),
    onSettled: () => invalidateMockTestData(qc),
  });
}

export function useUpdateMockTest() {
  const { mockTests } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: MockTestUpdate }) =>
      mockTests.update(v.id, v.patch),
    onSettled: () => invalidateMockTestData(qc),
  });
}

export function useDeleteMockTest() {
  const { mockTests } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mockTests.remove(id),
    onSettled: () => invalidateMockTestData(qc),
  });
}
