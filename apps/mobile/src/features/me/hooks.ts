import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateMeInput } from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';

export function useMe() {
  const { me } = useApi();
  return useQuery({ queryKey: queryKeys.me, queryFn: () => me.get() });
}

export function useUpdateMe() {
  const { me } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateMeInput) => me.update(patch),
    onSuccess: user => qc.setQueryData(queryKeys.me, user),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export function useDeleteAccount() {
  const { me } = useApi();
  return useMutation({ mutationFn: () => me.remove() });
}
