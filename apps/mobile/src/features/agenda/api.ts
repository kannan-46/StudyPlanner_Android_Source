import type { AgendaItem } from '@planner/shared';
import type { Http } from '../../shared/api/http';

export function makeAgendaApi(http: Http) {
  return {
    get: async (today: string, days: number): Promise<AgendaItem[]> =>
      (await http.get<{ items: AgendaItem[] }>('/v1/agenda', { today, days }))
        .items,
  };
}
