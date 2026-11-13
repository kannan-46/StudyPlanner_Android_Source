import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { AgendaItem, TopicView } from '@planner/shared';
import { createQueryClient, queryKeys } from '../../../shared/api/queryClient';
import { ApiProvider } from '../../../shared/api/ApiProvider';
import type { Http } from '../../../shared/api/http';
import { ApiError } from '../../../shared/api/errors';
import { useCompleteRevision } from '../hooks';

const topic: TopicView = {
  id: 't1',
  name: 'Topic',
  subjectId: 's1',
  examIds: [],
  studiedOn: '2026-11-01',
  intervals: [4, 7],
  notes: '',
  revisions: [
    { id: 'R1', step: 1, dueOn: '2026-11-05', doneOn: null, dueOverride: null },
    { id: 'R2', step: 2, dueOn: '2026-11-12', doneOn: null, dueOverride: null },
  ],
  nextDueOn: '2026-11-05',
  status: 'active',
  createdAt: '',
  updatedAt: '',
};
const agendaItem: AgendaItem = {
  topicId: 't1',
  topicName: 'Topic',
  subjectId: 's1',
  subjectName: 'S',
  revisionId: 'R1',
  step: 1,
  totalSteps: 2,
  dueOn: '2026-11-05',
  bucket: 'today',
};

const clients: QueryClient[] = [];
afterEach(() => {
  clients.splice(0).forEach(c => c.clear());
});

function setup(post: jest.Mock) {
  const http = {
    get: jest.fn(),
    post,
    patch: jest.fn(),
    del: jest.fn(),
  } as Http;
  const qc = createQueryClient();
  clients.push(qc);
  const today = '2026-11-13';
  qc.setQueryData(queryKeys.topic('t1'), topic);
  qc.setQueryData(queryKeys.agenda(today), [agendaItem]);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ApiProvider http={http}>{children}</ApiProvider>
    </QueryClientProvider>
  );
  return { qc, today, wrapper };
}

describe('useCompleteRevision', () => {
  it('shows R1 done immediately and removes the agenda item', async () => {
    const post = jest.fn(() => new Promise(() => {}));
    const { qc, today, wrapper } = setup(post);
    const { result } = await renderHook(() => useCompleteRevision(), {
      wrapper,
    });
    await act(async () => {
      result.current.mutate({
        topicId: 't1',
        revisionId: 'R1',
        doneOn: '2026-11-13',
      });
    });
    await waitFor(() => {
      const t = qc.getQueryData<TopicView>(queryKeys.topic('t1'));
      expect(t?.revisions[0]?.doneOn).toBe('2026-11-13');
    });
    expect(qc.getQueryData<AgendaItem[]>(queryKeys.agenda(today))).toEqual([]);
  });

  it('rolls back and surfaces the error when the API rejects', async () => {
    const post = jest.fn().mockRejectedValue(new ApiError('INTERNAL', 500));
    const { qc, today, wrapper } = setup(post);
    const { result } = await renderHook(() => useCompleteRevision(), {
      wrapper,
    });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          topicId: 't1',
          revisionId: 'R1',
          doneOn: '2026-11-13',
        }),
      ).rejects.toBeInstanceOf(ApiError);
    });
    expect(qc.getQueryData(queryKeys.topic('t1'))).toEqual(topic);
    expect(qc.getQueryData<AgendaItem[]>(queryKeys.agenda(today))).toEqual([
      agendaItem,
    ]);
  });
});
