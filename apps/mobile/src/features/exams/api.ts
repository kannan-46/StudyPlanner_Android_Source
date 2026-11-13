import type { ExamInput, ExamUpdate, ExamView } from '@planner/shared';
import type { Http } from '../../shared/api/http';

export function makeExamsApi(http: Http) {
  return {
    list: () => http.get<ExamView[]>('/v1/exams'),
    create: (input: ExamInput) => http.post<ExamView>('/v1/exams', input),
    update: (id: string, patch: ExamUpdate) =>
      http.patch<ExamView>(`/v1/exams/${id}`, patch),
    remove: (id: string) => http.del(`/v1/exams/${id}`),
  };
}
