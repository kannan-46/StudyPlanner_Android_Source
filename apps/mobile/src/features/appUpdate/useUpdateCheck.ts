import { useCallback, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppVersionView } from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';
import {
  loadDismissedUpdate,
  saveDismissedUpdate,
} from '../../shared/lib/localPrefs';
import {
  getInstalledVersion,
  type InstalledVersion,
} from '../../native/config';

/** Asks the server again at most this often (on start and on foreground). */
export const UPDATE_CHECK_STALE_MS = 6 * 60 * 60 * 1000;

export type UpdateCheck = {
  installed: InstalledVersion;
  /** The server's latest release; null until known or when the check failed. */
  latest: AppVersionView | null;
  /** The server has a higher versionCode than the installed app. */
  updateAvailable: boolean;
  /**
   * updateAvailable, the user has not tapped Later for this version, and the
   * prompt has not been closed since the last answer from the server.
   */
  showPrompt: boolean;
  /** Later: hides the prompt until a newer version than this one is released. */
  dismiss: () => Promise<void>;
  /** Closes the prompt until the next check (next start or foreground check). */
  close: () => void;
  /** Opens the download link; resolves false when it could not be opened. */
  download: () => Promise<boolean>;
  /**
   * Checks again now (Settings) and resolves with the outcome: a newer
   * release, the latest already installed, or no answer (offline, server
   * error). Never rejects.
   */
  recheck: () => Promise<RecheckOutcome>;
  checking: boolean;
  /** The last check failed (the shown answer, if any, is from before). */
  checkFailed: boolean;
  /** When the server last answered (ms since epoch); 0 before any answer. */
  checkedAt: number;
};

export type RecheckOutcome = 'update' | 'latest' | 'failed';

export function useUpdateCheck(): UpdateCheck {
  const { appVersion } = useApi();
  const qc = useQueryClient();
  const installed = useMemo(getInstalledVersion, []);

  // Any failure (offline, 404 from an older API, a bad body) simply means no
  // prompt: no retries. Only a check the user starts (recheck) reports it.
  const versionQ = useQuery({
    queryKey: queryKeys.appVersion,
    queryFn: () => appVersion.latest(),
    enabled: installed.code !== null,
    staleTime: UPDATE_CHECK_STALE_MS,
    retry: false,
  });
  const latest = versionQ.data ?? null;
  const updateAvailable =
    latest !== null &&
    installed.code !== null &&
    latest.latestVersionCode > installed.code;
  // Only read the Later choice when there is something to show.
  const dismissedQ = useQuery({
    queryKey: queryKeys.updateDismissed,
    queryFn: loadDismissedUpdate,
    enabled: updateAvailable,
    staleTime: Infinity,
    retry: false,
  });
  // When the prompt was closed (Download), as the server answer's timestamp:
  // a later answer (next start or foreground check) shows it again.
  const checkedAt = versionQ.dataUpdatedAt;
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const showPrompt =
    updateAvailable &&
    dismissedQ.isSuccess &&
    (dismissedQ.data ?? 0) < latest.latestVersionCode &&
    (closedAt === null || checkedAt > closedAt);

  const close = useCallback(() => setClosedAt(checkedAt), [checkedAt]);

  const latestCode = latest?.latestVersionCode ?? null;
  const dismiss = useCallback(async () => {
    if (latestCode === null) return;
    qc.setQueryData(queryKeys.updateDismissed, latestCode);
    await saveDismissedUpdate(latestCode);
  }, [qc, latestCode]);

  const url = latest?.downloadUrl ?? null;
  const download = useCallback(async () => {
    if (!url) return false;
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      return false;
    }
  }, [url]);

  const { refetch } = versionQ;
  const installedCode = installed.code;
  const recheck = useCallback(async (): Promise<RecheckOutcome> => {
    try {
      const r = await refetch();
      if (r.isError || !r.data) return 'failed';
      return installedCode !== null && r.data.latestVersionCode > installedCode
        ? 'update'
        : 'latest';
    } catch {
      return 'failed';
    }
  }, [refetch, installedCode]);

  return {
    installed,
    latest,
    updateAvailable,
    showPrompt,
    dismiss,
    close,
    download,
    recheck,
    checking: versionQ.isFetching,
    checkFailed: versionQ.isError,
    checkedAt,
  };
}
