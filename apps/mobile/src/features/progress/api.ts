import type {
  MockTestInput,
  MockTestUpdate,
  MockTestView,
  StatsView,
} from '@planner/shared';
import type { Http } from '../../shared/api/http';

export function makeStatsApi(http: Http) {
  return {
    get: (today: string) => http.get<StatsView>('/v1/stats', { today }),
  };
}

export function makeMockTestsApi(http: Http) {
  return {
    list: () => http.get<MockTestView[]>('/v1/mock-tests'),
    create: (input: MockTestInput) =>
      http.post<MockTestView>('/v1/mock-tests', input),
    update: (id: string, patch: MockTestUpdate) =>
      http.patch<MockTestView>(`/v1/mock-tests/${id}`, patch),
    remove: (id: string) => http.del(`/v1/mock-tests/${id}`),
  };
}
