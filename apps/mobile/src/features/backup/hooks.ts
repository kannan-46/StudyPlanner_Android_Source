import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../shared/api/ApiProvider';
import {
  ApiError,
  isSessionEndedError,
  userMessage,
} from '../../shared/api/errors';
import { isUserDataQuery } from '../../shared/api/queryClient';
import { saveBackupFile } from '../../native/backupFiles';

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
    // closed update dialog does not come back). The refresh runs in the
    // background: the result message does not wait for every list to reload.
    onSettled: () => {
      qc.invalidateQueries({ predicate: isUserDataQuery }).catch(() => {});
    },
  });
}

/** Text shown when the backup file could not be written on the phone. */
export const SAVE_FILE_FAILED_TEXT = "Couldn't save the backup file";

/** How an export to a file ended. Nothing is shown by the hook itself. */
export type ExportOutcome =
  | { status: 'saved' }
  /** The user closed the save screen (or signed out meanwhile): say nothing. */
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

const isCancel = (e: unknown) =>
  (e as { code?: string } | null)?.code === 'E_CANCELLED';

/**
 * Downloads the backup and asks where to save it (compact JSON, with a dated
 * file name such as surgical-study-planner-backup-2026-11-16.json). The
 * caller shows the outcome, so it can word it for its own flow.
 */
export function useExportToFile(): {
  exportToFile: () => Promise<ExportOutcome>;
  exporting: boolean;
} {
  const exporter = useExportBackup();
  const { mutateAsync } = exporter;
  const exportToFile = useCallback(async (): Promise<ExportOutcome> => {
    try {
      const backup = await mutateAsync();
      // Compact: about half the size of indented JSON, so even 5,000 topics
      // stay well inside what the import accepts.
      await saveBackupFile(JSON.stringify(backup));
      return { status: 'saved' };
    } catch (e) {
      if (isCancel(e) || isSessionEndedError(e)) return { status: 'cancelled' };
      return {
        status: 'failed',
        message:
          e instanceof ApiError
            ? userMessage(e, 'backup')
            : SAVE_FILE_FAILED_TEXT,
      };
    }
  }, [mutateAsync]);
  return { exportToFile, exporting: exporter.isPending };
}
