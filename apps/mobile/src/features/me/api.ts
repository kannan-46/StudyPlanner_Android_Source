import type { UpdateMeInput, UserView } from '@planner/shared';
import type { Http } from '../../shared/api/http';

export function makeMeApi(http: Http) {
  return {
    get: () => http.get<UserView>('/v1/me'),
    update: (patch: UpdateMeInput) => http.patch<UserView>('/v1/me', patch),
    remove: () => http.del('/v1/me'),
  };
}
