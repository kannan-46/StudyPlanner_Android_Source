import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { DEFAULT_SETTINGS, type AgendaItem } from '@planner/shared';
import { createQueryClient } from '../../../shared/api/queryClient';
import { ApiProvider } from '../../../shared/api/ApiProvider';
import type { Http } from '../../../shared/api/http';
import { useReminderSnapshotSync } from '../useReminderSnapshotSync';
import {
  configureReminders,
  syncReminderSnapshot,
} from '../../../native/reminders';

jest.mock('../../../native/reminders', () => ({
  syncReminderSnapshot: jest.fn().mockResolvedValue(undefined),
  configureReminders: jest.fn().mockResolvedValue(undefined),
}));

const item = (topicName: string, dueOn: string): AgendaItem => ({
  topicId: topicName,
  topicName,
  subjectId: 's1',
  subjectName: 'S',
  revisionId: `r-${topicName}`,
  step: 1,
  totalSteps: 6,
  dueOn,
  bucket: 'today',
});

const clients: QueryClient[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) {
    await c.cancelQueries();
    c.clear();
  }
  jest.clearAllMocks();
});

it('syncs mapped agenda items and configures from me settings', async () => {
  const get = jest.fn(async (path: string) => {
    if (path === '/v1/agenda') {
      return { items: [item('A', '2026-11-13'), item('B', '2026-11-20')] };
    }
    return {
      id: 'u1',
      settings: { ...DEFAULT_SETTINGS, dailyReminder: true, reminderTime: '08:00' },
    };
  });
  const http = { get, post: jest.fn(), patch: jest.fn(), del: jest.fn() } as unknown as Http;
  const qc = createQueryClient();
  qc.setDefaultOptions({ queries: { retry: false } });
  clients.push(qc);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ApiProvider http={http}>{children}</ApiProvider>
    </QueryClientProvider>
  );
  const { unmount } = await renderHook(() => useReminderSnapshotSync(), { wrapper });
  await waitFor(() =>
    expect(syncReminderSnapshot).toHaveBeenCalledWith([
      { topicName: 'A', dueOn: '2026-11-13' },
      { topicName: 'B', dueOn: '2026-11-20' },
    ]),
  );
  await waitFor(() => expect(configureReminders).toHaveBeenCalledWith(true, '08:00'));
  unmount();
});
