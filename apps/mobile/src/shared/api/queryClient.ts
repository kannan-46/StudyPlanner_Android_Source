import { AppState, type AppStateStatus } from 'react-native';
import { QueryClient, focusManager } from '@tanstack/react-query';
import type { TopicListQuery } from '@planner/shared';
import { ApiError } from './errors';

export const queryKeys = {
  me: ['me'] as const,
  exams: ['exams'] as const,
  subjects: ['subjects'] as const,
  topics: (q?: TopicListQuery) => ['topics', q ?? {}] as const,
  topic: (id: string) => ['topic', id] as const,
  agenda: (today: string, days: number) => ['agenda', today, days] as const,
  stats: (today: string) => ['stats', today] as const,
  mockTests: ['mockTests'] as const,
  appVersion: ['appUpdate', 'version'] as const,
  updateDismissed: ['appUpdate', 'dismissed'] as const,
};

/**
 * Queries that hold the user's data: everything except the update check,
 * which keeps its own 6-hour staleTime and is not affected by data changes.
 */
export const isUserDataQuery = (query: {
  queryKey: readonly unknown[];
}): boolean => query.queryKey[0] !== 'appUpdate';

/** Queries refreshed when the app returns to the foreground. */
export const refreshOnForeground = isUserDataQuery;

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.status >= 400 && error.status < 500) return false;
    if (error.code === 'NETWORK') return failureCount < 2;
  }
  return failureCount < 1;
}

let focusWired = false;
function wireFocusManager(): void {
  if (focusWired) return;
  focusWired = true;
  focusManager.setEventListener(handleFocus => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) =>
      handleFocus(s === 'active'),
    );
    return () => sub.remove();
  });
}

/**
 * Requests run even when the phone reports no connection: they then fail with
 * a NETWORK error, so forms and screens show the error and Retry instead of a
 * spinner that waits (paused) until the connection returns. Data already
 * loaded stays on screen; it refetches when the connection comes back.
 */
export const mutationDefaults = {
  retry: false,
  networkMode: 'always',
} as const;

export function createQueryClient(): QueryClient {
  wireFocusManager();
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetry, networkMode: 'always' },
      mutations: mutationDefaults,
    },
  });
}
