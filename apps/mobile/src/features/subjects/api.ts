import type { SubjectInput, SubjectView } from '@planner/shared';
import type { Http } from '../../shared/api/http';

export function makeSubjectsApi(http: Http) {
  return {
    list: () => http.get<SubjectView[]>('/v1/subjects'),
    create: (input: SubjectInput) =>
      http.post<SubjectView>('/v1/subjects', input),
    update: (id: string, patch: Partial<SubjectInput>) =>
      http.patch<SubjectView>(`/v1/subjects/${id}`, patch),
    remove: (id: string) => http.del(`/v1/subjects/${id}`),
  };
}
