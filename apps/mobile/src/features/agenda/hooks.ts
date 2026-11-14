import { useQuery } from '@tanstack/react-query';
import type { LocalDate } from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';
import { useLocalToday } from '../../shared/lib/useLocalToday';

/**
 * Agenda from `today` for `days` days. `today` defaults to the phone's date,
 * kept current across midnight, so the query moves to the new day by itself.
 */
export function useAgenda(days = 30, today?: LocalDate) {
  const { agenda } = useApi();
  const localToday = useLocalToday();
  const day = today ?? localToday;
  return useQuery({
    queryKey: queryKeys.agenda(day, days),
    queryFn: () => agenda.get(day, days),
  });
}
