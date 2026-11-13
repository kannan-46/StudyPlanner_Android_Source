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
};

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

export function createQueryClient(): QueryClient {
  wireFocusManager();
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetry },
      mutations: { retry: false },
    },
  });
}
