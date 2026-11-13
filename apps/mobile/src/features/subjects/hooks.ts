import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SubjectInput } from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';
import { invalidateExamSubjectData } from '../../shared/api/invalidate';

export function useSubjects() {
  const { subjects } = useApi();
  return useQuery({
    queryKey: queryKeys.subjects,
    queryFn: () => subjects.list(),
  });
}

export function useCreateSubject() {
  const { subjects } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubjectInput) => subjects.create(input),
    onSettled: () => invalidateExamSubjectData(qc),
  });
}

export function useUpdateSubject() {
  const { subjects } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: Partial<SubjectInput> }) =>
      subjects.update(v.id, v.patch),
    onSettled: () => invalidateExamSubjectData(qc),
  });
}

export function useDeleteSubject() {
  const { subjects } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => subjects.remove(id),
    onSettled: () => invalidateExamSubjectData(qc),
  });
}
