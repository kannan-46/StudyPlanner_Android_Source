import { useCallback, useEffect, useRef, useState } from 'react';
import { userMessage } from '../api/errors';
import { useSnackbar } from './Snackbar';

/** The parts of a React Query refetch() result this hook reads. */
export type RefreshResult = {
  isError: boolean;
  error: unknown;
  data?: unknown;
};

/** True when there is something on screen to keep showing. */
export function hasRefreshData(data: unknown): boolean {
  if (data === undefined || data === null) return false;
  return !Array.isArray(data) || data.length > 0;
}

export function refreshFailedMessage(error: unknown): string {
  return `Couldn't refresh. ${userMessage(error)}`;
}

/**
 * Pull-to-refresh state for a list: `refreshing` for the RefreshControl and
 * `onRefresh` to pass to it. When the refresh fails while older data is
 * still on screen, a snackbar says so and offers Retry (otherwise the
 * spinner just stops and the list looks unchanged).
 *
 * `refetch` returns one React Query result or several (e.g. topics and
 * subjects). `shouldReport` decides which failures get a snackbar; by default
 * a failure is reported only while that query still has data, because with
 * no data the screen already shows its own error and Retry.
 *
 *   const { refreshing, onRefresh } = usePullToRefresh(() => agendaQ.refetch());
 *   <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
 */
export function usePullToRefresh(
  refetch: () => Promise<RefreshResult | RefreshResult[]>,
  options: { shouldReport?: (r: RefreshResult) => boolean } = {},
): { refreshing: boolean; onRefresh: () => Promise<void> } {
  const snackbar = useSnackbar();
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const latest = useRef({ refetch, options });
  latest.current = { refetch, options };

  const onRefresh = useCallback(async (): Promise<void> => {
    const { refetch: run, options: opts } = latest.current;
    const report =
      opts.shouldReport ?? (r => r.isError && hasRefreshData(r.data));
    setRefreshing(true);
    let failed: RefreshResult | undefined;
    try {
      const out = await run();
      const results = Array.isArray(out) ? out : [out];
      failed = results.find(r => r && report(r));
    } catch (error) {
      failed = { isError: true, error };
    } finally {
      if (mounted.current) setRefreshing(false);
    }
    if (failed && mounted.current) {
      snackbar.show({
        message: refreshFailedMessage(failed.error),
        actionLabel: 'Retry',
        onAction: () => {
          onRefresh();
        },
      });
    }
  }, [snackbar]);

  return { refreshing, onRefresh };
}
