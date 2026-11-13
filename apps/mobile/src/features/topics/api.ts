import type {
  TopicCreateInput,
  TopicListQuery,
  TopicUpdateInput,
  TopicView,
} from '@planner/shared';
import type { Http } from '../../shared/api/http';

export function makeTopicsApi(http: Http) {
  return {
    list: (query: TopicListQuery = {}) =>
      http.get<TopicView[]>('/v1/topics', query),
    get: (id: string) => http.get<TopicView>(`/v1/topics/${id}`),
    create: (input: TopicCreateInput) =>
      http.post<TopicView>('/v1/topics', input),
    update: (id: string, patch: TopicUpdateInput) =>
      http.patch<TopicView>(`/v1/topics/${id}`, patch),
    remove: (id: string) => http.del(`/v1/topics/${id}`),
  };
}
