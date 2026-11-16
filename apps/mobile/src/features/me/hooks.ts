import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateMeInput } from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';
import {
  currentSession,
  isCurrentSession,
  type SessionEpoch,
} from '../../shared/api/session';

export function useMe() {
  const { me } = useApi();
  return useQuery({ queryKey: queryKeys.me, queryFn: () => me.get() });
}

export function useUpdateMe() {
  const { me } = useApi();
  const qc = useQueryClient();
  return useMutation({
    onMutate: (): { session: SessionEpoch } => ({ session: currentSession() }),
    mutationFn: (patch: UpdateMeInput) => me.update(patch),
    onSuccess: (user, _patch, ctx) => {
      // Signed out while saving: this is the old account's data.
      if (ctx && !isCurrentSession(ctx.session)) return;
      qc.setQueryData(queryKeys.me, user);
    },
    onSettled: (_d, _e, _patch, ctx) => {
      if (ctx && !isCurrentSession(ctx.session)) return;
      // In the background: the save settles as soon as the server answers.
      qc.invalidateQueries({ queryKey: queryKeys.me }).catch(() => {});
    },
  });
}

export function useDeleteAccount() {
  const { me } = useApi();
  return useMutation({ mutationFn: () => me.remove() });
}
