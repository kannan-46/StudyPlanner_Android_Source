import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { AgendaItem, TopicView } from '@planner/shared';
import { createQueryClient, queryKeys } from '../../../shared/api/queryClient';
import { ApiProvider } from '../../../shared/api/ApiProvider';
import type { Http } from '../../../shared/api/http';
import { ApiError } from '../../../shared/api/errors';
import { useCompleteRevision, useUndoRevision } from '../hooks';
import { placeInAgenda } from '../../agenda/cache';
import { useAgenda } from '../../agenda/hooks';

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
const cleanups: (() => void)[] = [];
afterEach(async () => {
  cleanups.splice(0).forEach(fn => fn());
  for (const c of clients.splice(0)) {
    await c.cancelQueries();
    c.getMutationCache().clear();
    c.clear();
  }
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

function setup(post: jest.Mock) {
  const http = {
    get: jest.fn(),
    post,
    patch: jest.fn(),
    del: jest.fn(),
  } as Http;
  const qc = createQueryClient();
  qc.setDefaultOptions({
    queries: { retry: false },
    mutations: { gcTime: 0, retry: false },
  });
  clients.push(qc);
  const today = '2026-11-13';
  qc.setQueryData(queryKeys.topic('t1'), topic);
  qc.setQueryData(queryKeys.agenda(today, 30), [agendaItem]);
  qc.setQueryData(queryKeys.agenda(today, 60), [agendaItem]);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ApiProvider http={http}>{children}</ApiProvider>
    </QueryClientProvider>
  );
  return { qc, today, wrapper };
}

describe('useCompleteRevision', () => {
  it('shows R1 done immediately and removes the agenda item', async () => {
    const gate = deferred<unknown>();
    const post = jest.fn(() => gate.promise);
    const { qc, today, wrapper } = setup(post);
    const { result, unmount } = await renderHook(() => useCompleteRevision(), {
      wrapper,
    });
    cleanups.push(unmount, () => gate.resolve({}));
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
    for (const days of [30, 60]) {
      expect(
        qc.getQueryData<AgendaItem[]>(queryKeys.agenda(today, days)),
      ).toEqual([]);
    }
  });

  it('rolls back and surfaces the error when the API rejects', async () => {
    const post = jest.fn().mockRejectedValue(new ApiError('INTERNAL', 500));
    const { qc, today, wrapper } = setup(post);
    const { result, unmount } = await renderHook(() => useCompleteRevision(), {
      wrapper,
    });
    cleanups.push(unmount);
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
    for (const days of [30, 60]) {
      expect(
        qc.getQueryData<AgendaItem[]>(queryKeys.agenda(today, days)),
      ).toEqual([agendaItem]);
    }
  });
});

describe('useUndoRevision', () => {
  it('restores the revision in the topic at once', async () => {
    const gate = deferred<unknown>();
    const post = jest.fn(() => gate.promise);
    const { qc, wrapper } = setup(post);
    const doneTopic: TopicView = {
      ...topic,
      revisions: [
        { ...topic.revisions[0]!, doneOn: '2026-11-13' },
        topic.revisions[1]!,
      ],
    };
    qc.setQueryData(queryKeys.topic('t1'), doneTopic);
    const { result, unmount } = await renderHook(() => useUndoRevision('t1'), {
      wrapper,
    });
    cleanups.push(unmount, () => gate.resolve({}));
    await act(async () => {
      result.current.mutate({ topicId: 't1', revisionId: 'R1' });
    });
    await waitFor(() => {
      const t = qc.getQueryData<TopicView>(queryKeys.topic('t1'));
      expect(t?.revisions[0]?.doneOn).toBeNull();
    });
  });

  it('waits for a Done on the same topic before sending', async () => {
    const gate = deferred<unknown>();
    const post = jest
      .fn()
      .mockImplementationOnce(() => gate.promise)
      .mockResolvedValue({});
    const { wrapper } = setup(post);
    const { result, unmount } = await renderHook(
      () => ({
        complete: useCompleteRevision('t1'),
        undo: useUndoRevision('t1'),
      }),
      { wrapper },
    );
    cleanups.push(unmount, () => gate.resolve({}));
    await act(async () => {
      result.current.complete.mutate({
        topicId: 't1',
        revisionId: 'R1',
        doneOn: '2026-11-13',
      });
    });
    await act(async () => {
      result.current.undo.mutate({ topicId: 't1', revisionId: 'R1' });
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![0]).toMatch(/complete$/);
    await act(async () => gate.resolve({}));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1]![0]).toMatch(/undo$/);
  });
});

describe('agenda during Done and Undo', () => {
  const todayItem: AgendaItem = { ...agendaItem, dueOn: '2026-11-13' };

  it('a saved Done puts the next revision under upcoming', async () => {
    const saved: TopicView = {
      ...topic,
      revisions: [
        { ...topic.revisions[0]!, doneOn: '2026-11-13' },
        { ...topic.revisions[1]!, dueOn: '2026-11-20' },
      ],
      nextDueOn: '2026-11-20',
    };
    const post = jest.fn().mockResolvedValue(saved);
    const { qc, today, wrapper } = setup(post);
    qc.setQueryData(queryKeys.agenda(today, 30), [todayItem]);
    const { result, unmount } = await renderHook(
      () => useCompleteRevision('t1'),
      { wrapper },
    );
    cleanups.push(unmount);
    await act(async () => {
      await result.current.mutateAsync({
        topicId: 't1',
        revisionId: 'R1',
        doneOn: today,
      });
    });
    expect(qc.getQueryData(queryKeys.agenda(today, 30))).toEqual([
      {
        ...todayItem,
        revisionId: 'R2',
        step: 2,
        dueOn: '2026-11-20',
        bucket: 'upcoming',
      },
    ]);
  });

  it('an Undo queued behind the Done restores the row at once, for good', async () => {
    const gate = deferred<unknown>();
    const post = jest
      .fn()
      .mockImplementationOnce(() => gate.promise)
      .mockResolvedValue({});
    const { qc, today, wrapper } = setup(post);
    qc.setQueryData(queryKeys.agenda(today, 30), [todayItem]);
    const { result, unmount } = await renderHook(
      () => ({
        complete: useCompleteRevision('t1'),
        undo: useUndoRevision('t1'),
      }),
      { wrapper },
    );
    cleanups.push(unmount, () => gate.resolve({}));
    const agenda = () => qc.getQueryData(queryKeys.agenda(today, 30));
    await act(async () => {
      result.current.complete.mutate({
        topicId: 't1',
        revisionId: 'R1',
        doneOn: today,
      });
    });
    await waitFor(() => expect(agenda()).toEqual([]));
    await act(async () => {
      result.current.undo.mutate({
        topicId: 't1',
        revisionId: 'R1',
        restore: todayItem,
      });
    });
    await waitFor(() => expect(agenda()).toEqual([todayItem]));
    // The Done's answer must not replace the restored row.
    await act(async () =>
      gate.resolve({
        ...topic,
        revisions: [
          { ...topic.revisions[0]!, doneOn: today },
          topic.revisions[1]!,
        ],
      }),
    );
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(agenda()).toEqual([todayItem]);
  });
});

describe('placeInAgenda', () => {
  const key = ['agenda', '2026-11-13', 30];
  const at = (topicId: string, topicName: string, dueOn: string) => ({
    ...agendaItem,
    topicId,
    topicName,
    dueOn,
  });

  it('sorts the row in by date then name and sets its bucket', () => {
    const items = [
      at('a', 'Alpha', '2026-11-10'),
      at('c', 'Gamma', '2026-11-13'),
      at('d', 'Delta', '2026-11-20'),
    ];
    const placed = placeInAgenda(
      items,
      key,
      'b',
      at('b', 'beta', '2026-11-13'),
    );
    expect(placed.map(i => i.topicId)).toEqual(['a', 'b', 'c', 'd']);
    const bucketOf = (dueOn: string) =>
      placeInAgenda(items, key, 'b', at('b', 'B', dueOn)).find(
        i => i.topicId === 'b',
      )?.bucket;
    expect(bucketOf('2026-11-12')).toBe('overdue');
    expect(bucketOf('2026-11-13')).toBe('today');
    expect(bucketOf('2026-11-14')).toBe('upcoming');
  });

  it('drops the topic when its next revision is after the range', () => {
    const items = [at('a', 'Alpha', '2026-11-13')];
    expect(
      placeInAgenda(items, key, 'a', at('a', 'Alpha', '2026-12-30')),
    ).toEqual([]);
    expect(placeInAgenda(items, key, 'a', null)).toEqual([]);
  });
});

describe('useAgenda', () => {
  it('keeps a row hidden while its Done is saved, even after a refetch', async () => {
    const gate = deferred<unknown>();
    const post = jest.fn(() => gate.promise);
    const { qc, today } = setup(post);
    const row: AgendaItem = { ...agendaItem, dueOn: today };
    const get = jest.fn().mockResolvedValue({ items: [row] });
    const http = { get, post, patch: jest.fn(), del: jest.fn() } as Http;
    const wrap = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ApiProvider http={http}>{children}</ApiProvider>
      </QueryClientProvider>
    );
    qc.setQueryData(queryKeys.agenda(today, 30), [row]);
    const { result, unmount } = await renderHook(
      () => ({
        agenda: useAgenda(30, today),
        complete: useCompleteRevision('t1'),
      }),
      { wrapper: wrap },
    );
    cleanups.push(unmount, () => gate.resolve({}));
    await act(async () => {
      result.current.complete.mutate({
        topicId: 't1',
        revisionId: 'R1',
        doneOn: today,
      });
    });
    // Another change refetches the agenda; the server still has R1 due.
    await act(async () => {
      await result.current.agenda.refetch();
    });
    expect(qc.getQueryData(queryKeys.agenda(today, 30))).toEqual([row]);
    expect(result.current.agenda.data).toEqual([]);
  });
});
