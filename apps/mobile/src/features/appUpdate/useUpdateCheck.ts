import { useCallback, useMemo } from 'react';
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
  /** updateAvailable, and the user has not tapped Later for this version. */
  showBanner: boolean;
  /** Hides the banner until a newer version than this one is released. */
  dismiss: () => Promise<void>;
  /** Opens the download link; resolves false when it could not be opened. */
  download: () => Promise<boolean>;
  /** Checks again now (Settings). */
  recheck: () => void;
  checking: boolean;
};

export function useUpdateCheck(): UpdateCheck {
  const { appVersion } = useApi();
  const qc = useQueryClient();
  const installed = useMemo(getInstalledVersion, []);

  // Any failure (offline, 404 from an older API, a bad body) simply means no
  // prompt: no retries, no error UI.
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
  const showBanner =
    updateAvailable &&
    dismissedQ.isSuccess &&
    (dismissedQ.data ?? 0) < latest.latestVersionCode;

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
  const recheck = useCallback(() => {
    refetch().catch(() => undefined);
  }, [refetch]);

  return {
    installed,
    latest,
    updateAvailable,
    showBanner,
    dismiss,
    download,
    recheck,
    checking: versionQ.isFetching,
  };
}
