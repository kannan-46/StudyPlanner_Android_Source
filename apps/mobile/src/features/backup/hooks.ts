import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../shared/api/ApiProvider';
import { isUserDataQuery } from '../../shared/api/queryClient';

export function useExportBackup() {
  const { backup } = useApi();
  return useMutation({ mutationFn: () => backup.export() });
}

export function useImportBackup() {
  const { backup } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { mode: 'merge' | 'replace'; data: unknown }) =>
      backup.import(v.mode, v.data),
    // An import can change all of the user's data (not the update check, so a
    // closed update dialog does not come back).
    onSettled: () => qc.invalidateQueries({ predicate: isUserDataQuery }),
  });
}
