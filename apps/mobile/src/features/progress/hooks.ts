import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  MockTestInput,
  MockTestUpdate,
  MockTestView,
} from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';
import { invalidateMockTestData } from '../../shared/api/invalidate';
import { useLocalToday } from '../../shared/lib/useLocalToday';

/** Shared by every mock test delete, so the screen can list them all. */
export const DELETE_MOCK_TEST_KEY = ['mockTest', 'delete'] as const;

export function useStats() {
  const { stats } = useApi();
  const today = useLocalToday();
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
    mutationKey: DELETE_MOCK_TEST_KEY,
    mutationFn: (id: string) => mockTests.remove(id),
    // Take the row off at once, so it never looks usable again while the
    // list reloads.
    onSuccess: (_res, id) =>
      qc.setQueryData<MockTestView[]>(queryKeys.mockTests, old =>
        old?.filter(t => t.id !== id),
      ),
    onSettled: () => invalidateMockTestData(qc),
  });
}

/**
 * Ids of every mock test whose delete is still running. A second delete
 * started while the first runs does not make the first row usable again.
 */
export function usePendingMockTestDeletes(): string[] {
  return useMutationState({
    filters: { mutationKey: DELETE_MOCK_TEST_KEY, status: 'pending' },
    select: m => m.state.variables as string,
  });
}
