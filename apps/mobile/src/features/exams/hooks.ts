import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { ExamInput, ExamUpdate } from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';
import { invalidateExamSubjectData } from '../../shared/api/invalidate';

/**
 * Exam names and topic counts also appear in Progress (stats), so those are
 * marked stale too. Like invalidateExamSubjectData this does not wait.
 */
export function invalidateExamChange(
  qc: QueryClient,
  opts: { topics?: boolean } = {},
): Promise<void> {
  qc.invalidateQueries({ queryKey: ['stats'] }).catch(() => {});
  return invalidateExamSubjectData(qc, opts);
}

export function useExams() {
  const { exams } = useApi();
  return useQuery({ queryKey: queryKeys.exams, queryFn: () => exams.list() });
}

export function useCreateExam() {
  const { exams } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ExamInput) => exams.create(input),
    // A new exam is linked to nothing yet, so topic lists stay as they are.
    onSettled: () => invalidateExamChange(qc, { topics: false }),
  });
}

export function useUpdateExam() {
  const { exams } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: ExamUpdate }) =>
      exams.update(v.id, v.patch),
    // A rename or a new date does not change any topic.
    onSettled: () => invalidateExamChange(qc, { topics: false }),
  });
}

export function useDeleteExam() {
  const { exams } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => exams.remove(id),
    // The server removes the exam from its topics and mock tests.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['mockTests'] }).catch(() => {});
      return invalidateExamChange(qc);
    },
  });
}
