import { useQuery } from '@tanstack/react-query';
import { localToday } from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';

export function useAgenda(days = 30) {
  const { agenda } = useApi();
  const today = localToday();
  return useQuery({
    queryKey: queryKeys.agenda(today),
    queryFn: () => agenda.get(today, days),
  });
}
