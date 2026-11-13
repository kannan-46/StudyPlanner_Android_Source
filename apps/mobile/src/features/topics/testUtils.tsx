import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { SubjectView, ExamView, TopicView } from '@planner/shared';
import { createQueryClient } from '../../shared/api/queryClient';
import { ApiProvider } from '../../shared/api/ApiProvider';
import type { Http } from '../../shared/api/http';
import { ThemeProvider } from '../../shared/ui/ThemeProvider';
import { SnackbarProvider } from '../../shared/ui/Snackbar';

export const ID = (n: number) => String(n).padStart(24, '0');

export const subjects: SubjectView[] = [
  { id: ID(1), name: 'Anatomy', topicCount: 1 },
  { id: ID(2), name: 'Physiology', topicCount: 0 },
];
export const exams: ExamView[] = [
  { id: ID(11), name: 'MS General Surgery', examDate: null },
];

export const topic = (over: Partial<TopicView> = {}): TopicView => ({
  id: ID(100),
  name: 'Hernia',
  subjectId: ID(1),
  examIds: [ID(11)],
  studiedOn: '2026-11-01',
  intervals: [4, 7],
  notes: 'Some notes',
  revisions: [
    {
      id: 'R1',
      step: 1,
      dueOn: '2026-11-05',
      doneOn: '2026-11-05',
      dueOverride: null,
    },
    {
      id: 'R2',
      step: 2,
      dueOn: '2026-11-12',
      doneOn: null,
      dueOverride: null,
    },
  ],
  nextDueOn: '2026-11-12',
  status: 'active',
  createdAt: '',
  updatedAt: '',
  ...over,
});

export type Mocks = {
  get: jest.Mock;
  post: jest.Mock;
  patch: jest.Mock;
  del: jest.Mock;
};

export function makeHttp(topics: TopicView[] = []): Mocks {
  return {
    get: jest.fn(async (path: string) => {
      if (path === '/v1/subjects') return subjects;
      if (path === '/v1/exams') return exams;
      if (path === '/v1/topics') return topics;
      const m = /^\/v1\/topics\/(.+)$/.exec(path);
      if (m) return topics.find(t => t.id === m[1]);
      return [];
    }),
    post: jest.fn(),
    patch: jest.fn(),
    del: jest.fn(),
  };
}

const clients: QueryClient[] = [];
export async function cleanupClients() {
  for (const c of clients.splice(0)) {
    await c.cancelQueries();
    c.clear();
  }
}

export async function renderWithProviders(ui: React.ReactElement, http: Mocks) {
  const qc = createQueryClient();
  qc.setDefaultOptions({
    queries: { retry: false },
    mutations: { retry: false },
  });
  clients.push(qc);
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 800 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider mode="light">
        <QueryClientProvider client={qc}>
          <ApiProvider http={http as unknown as Http}>
            <SnackbarProvider>{ui}</SnackbarProvider>
          </ApiProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}
