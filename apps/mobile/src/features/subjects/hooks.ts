import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SubjectInput } from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';
import { invalidateExamChange } from '../exams/hooks';

export function useSubjects() {
  const { subjects } = useApi();
  return useQuery({
    queryKey: queryKeys.subjects,
    queryFn: () => subjects.list(),
  });
}

// Subject names also appear in Progress (stats), so those refresh too. Only
// deleting an exam changes topics; no subject change does.

export function useCreateSubject() {
  const { subjects } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubjectInput) => subjects.create(input),
    onSettled: () => invalidateExamChange(qc, { topics: false }),
  });
}

export function useUpdateSubject() {
  const { subjects } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: Partial<SubjectInput> }) =>
      subjects.update(v.id, v.patch),
    onSettled: () => invalidateExamChange(qc, { topics: false }),
  });
}

export function useDeleteSubject() {
  const { subjects } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => subjects.remove(id),
    // Only a subject with no topics can be deleted, so topics stay the same.
    onSettled: () => invalidateExamChange(qc, { topics: false }),
  });
}
