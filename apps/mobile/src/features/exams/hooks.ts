import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExamInput, ExamUpdate } from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';
import { invalidateExamSubjectData } from '../../shared/api/invalidate';

export function useExams() {
  const { exams } = useApi();
  return useQuery({ queryKey: queryKeys.exams, queryFn: () => exams.list() });
}

export function useCreateExam() {
  const { exams } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ExamInput) => exams.create(input),
    onSettled: () => invalidateExamSubjectData(qc),
  });
}

export function useUpdateExam() {
  const { exams } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: ExamUpdate }) =>
      exams.update(v.id, v.patch),
    onSettled: () => invalidateExamSubjectData(qc),
  });
}

export function useDeleteExam() {
  const { exams } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => exams.remove(id),
    onSettled: () => invalidateExamSubjectData(qc),
  });
}
