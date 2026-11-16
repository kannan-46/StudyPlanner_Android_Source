import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { AgendaItem, TopicView } from '@planner/shared';
import { createQueryClient, queryKeys } from '../../../shared/api/queryClient';
import { ApiProvider } from '../../../shared/api/ApiProvider';
import type { Http } from '../../../shared/api/http';
import { ApiError } from '../../../shared/api/errors';
import {
  useCompleteRevision,
  useSnoozeRevision,
  useUndoRevision,
  useUnsnoozeRevision,
} from '../hooks';
import { endSession } from '../../../shared/api/session';
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
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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
    // The pending Done reaches the hook through a batched notification.
    await waitFor(() => expect(result.current.agenda.data).toEqual([]));
    // Another change refetches the agenda; the server still has R1 due.
    await act(async () => {
      await result.current.agenda.refetch();
    });
    expect(qc.getQueryData(queryKeys.agenda(today, 30))).toEqual([row]);
    await waitFor(() => expect(result.current.agenda.data).toEqual([]));
  });
});

describe('useSnoozeRevision', () => {
  const todayItem: AgendaItem = { ...agendaItem, dueOn: '2026-11-13' };
  const snoozed: TopicView = {
    ...topic,
    revisions: [
      {
        ...topic.revisions[0]!,
        dueOn: '2026-11-14',
        dueOverride: '2026-11-14',
      },
      { ...topic.revisions[1]!, dueOn: '2026-11-17' },
    ],
    nextDueOn: '2026-11-14',
  };
  const vars = (today: string) => ({
    topicId: 't1',
    revisionId: 'R1',
    today,
    days: 1,
  });
  const moved: AgendaItem = {
    ...todayItem,
    dueOn: '2026-11-14',
    bucket: 'upcoming',
  };

  it('moves the row under upcoming and the topic to the new date at once', async () => {
    const gate = deferred<unknown>();
    const post = jest.fn(() => gate.promise);
    const { qc, today, wrapper } = setup(post);
    qc.setQueryData(queryKeys.agenda(today, 30), [todayItem]);
    qc.setQueryData(queryKeys.agenda(today, 60), [todayItem]);
    const { result, unmount } = await renderHook(
      () => useSnoozeRevision('t1'),
      { wrapper },
    );
    cleanups.push(unmount, () => gate.resolve({}));
    let saving: Promise<unknown> = Promise.resolve();
    await act(async () => {
      saving = result.current.mutateAsync(vars(today));
    });
    await waitFor(() =>
      expect(qc.getQueryData(queryKeys.agenda(today, 30))).toEqual([moved]),
    );
    expect(qc.getQueryData(queryKeys.agenda(today, 60))).toEqual([moved]);
    expect(
      qc.getQueryData<TopicView>(queryKeys.topic('t1'))?.revisions[0]
        ?.dueOverride,
    ).toBe('2026-11-14');
    await act(async () => {
      gate.resolve(snoozed);
      await saving;
    });
    expect(qc.getQueryData(queryKeys.topic('t1'))).toEqual(snoozed);
    expect(qc.getQueryData(queryKeys.agenda(today, 30))).toEqual([moved]);
  });

  it('the saved snooze shows as soon as mutateAsync resolves', async () => {
    const post = jest.fn().mockResolvedValue(snoozed);
    const { qc, today, wrapper } = setup(post);
    qc.removeQueries({ queryKey: queryKeys.topic('t1') });
    qc.setQueryData(queryKeys.agenda(today, 30), [todayItem]);
    const { result, unmount } = await renderHook(
      () => useSnoozeRevision('t1'),
      { wrapper },
    );
    cleanups.push(unmount);
    await act(async () => {
      await result.current.mutateAsync(vars(today));
    });
    expect(qc.getQueryData(queryKeys.agenda(today, 30))).toEqual([moved]);
    expect(
      qc.getQueryData<TopicView>(queryKeys.topic('t1'))?.revisions[0]
        ?.dueOverride,
    ).toBe('2026-11-14');
  });

  it('puts everything back when the snooze fails', async () => {
    const post = jest.fn().mockRejectedValue(new ApiError('NETWORK', 0));
    const { qc, today, wrapper } = setup(post);
    qc.setQueryData(queryKeys.agenda(today, 30), [todayItem]);
    const { result, unmount } = await renderHook(
      () => useSnoozeRevision('t1'),
      { wrapper },
    );
    cleanups.push(unmount);
    await act(async () => {
      await expect(result.current.mutateAsync(vars(today))).rejects.toThrow();
    });
    expect(qc.getQueryData(queryKeys.agenda(today, 30))).toEqual([todayItem]);
    expect(qc.getQueryData(queryKeys.topic('t1'))).toEqual(topic);
  });

  it('a refetch while the snooze is saved keeps the row moved', async () => {
    const gate = deferred<unknown>();
    const post = jest.fn(() => gate.promise);
    const { qc, today } = setup(post);
    // The server still has the revision due today until the snooze lands.
    const get = jest.fn().mockResolvedValue({ items: [todayItem] });
    const http = { get, post, patch: jest.fn(), del: jest.fn() } as Http;
    const wrap = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ApiProvider http={http}>{children}</ApiProvider>
      </QueryClientProvider>
    );
    qc.setQueryData(queryKeys.agenda(today, 30), [todayItem]);
    const { result, unmount } = await renderHook(
      () => ({
        agenda: useAgenda(30, today),
        snooze: useSnoozeRevision('t1'),
      }),
      { wrapper: wrap },
    );
    cleanups.push(unmount, () => gate.resolve({}));
    await act(async () => {
      result.current.snooze.mutate(vars(today));
    });
    // The overlay arrives through a batched notification, so wait for it.
    await waitFor(() => expect(result.current.agenda.data).toEqual([moved]));
    await act(async () => {
      await result.current.agenda.refetch();
    });
    expect(qc.getQueryData(queryKeys.agenda(today, 30))).toEqual([todayItem]);
    await waitFor(() => expect(result.current.agenda.data).toEqual([moved]));
  });
});

describe('useUnsnoozeRevision', () => {
  const todayItem: AgendaItem = { ...agendaItem, dueOn: '2026-11-13' };
  const moved: AgendaItem = {
    ...todayItem,
    dueOn: '2026-11-14',
    bucket: 'upcoming',
  };
  const snoozedTopic: TopicView = {
    ...topic,
    revisions: [
      {
        ...topic.revisions[0]!,
        dueOn: '2026-11-14',
        dueOverride: '2026-11-14',
      },
      { ...topic.revisions[1]!, dueOn: '2026-11-21' },
    ],
    nextDueOn: '2026-11-14',
  };
  const snoozeVars = {
    topicId: 't1',
    revisionId: 'R1',
    today: '2026-11-13',
    days: 1,
  };
  const vars = { topicId: 't1', revisionId: 'R1', dueOn: '2026-11-05' };

  it('puts the row and the topic back at once, then keeps the saved topic', async () => {
    const gate = deferred<unknown>();
    const post = jest.fn(() => gate.promise);
    const { qc, today, wrapper } = setup(post);
    qc.setQueryData(queryKeys.topic('t1'), snoozedTopic);
    qc.setQueryData(queryKeys.agenda(today, 30), [moved]);
    qc.setQueryData(queryKeys.agenda(today, 60), [moved]);
    const { result, unmount } = await renderHook(
      () => useUnsnoozeRevision('t1'),
      { wrapper },
    );
    cleanups.push(unmount, () => gate.resolve({}));
    let saving: Promise<unknown> = Promise.resolve();
    await act(async () => {
      saving = result.current.mutateAsync({ ...vars, restore: agendaItem });
    });
    const overdue = { ...agendaItem, bucket: 'overdue' };
    await waitFor(() =>
      expect(qc.getQueryData(queryKeys.agenda(today, 30))).toEqual([overdue]),
    );
    expect(qc.getQueryData(queryKeys.agenda(today, 60))).toEqual([overdue]);
    expect(
      qc.getQueryData<TopicView>(queryKeys.topic('t1'))?.revisions[0],
    ).toEqual(topic.revisions[0]);
    expect(post).toHaveBeenCalledWith('/v1/topics/t1/revisions/R1/unsnooze', {
      dueOn: '2026-11-05',
    });
    await act(async () => {
      gate.resolve(topic);
      await saving;
    });
    expect(qc.getQueryData(queryKeys.topic('t1'))).toEqual(topic);
    expect(qc.getQueryData(queryKeys.agenda(today, 30))).toEqual([overdue]);
  });

  it('without a saved row moves the cached row back to the date', async () => {
    const post = jest.fn().mockResolvedValue({});
    const { qc, today, wrapper } = setup(post);
    qc.setQueryData(queryKeys.topic('t1'), snoozedTopic);
    qc.setQueryData(queryKeys.agenda(today, 30), [moved]);
    const { result, unmount } = await renderHook(
      () => useUnsnoozeRevision('t1'),
      { wrapper },
    );
    cleanups.push(unmount);
    await act(async () => {
      await result.current.mutateAsync({ ...vars, dueOn: today });
    });
    expect(qc.getQueryData(queryKeys.agenda(today, 30))).toEqual([todayItem]);
  });

  it('puts the snoozed state back when it fails', async () => {
    const post = jest.fn().mockRejectedValue(new ApiError('NETWORK', 0));
    const { qc, today, wrapper } = setup(post);
    qc.setQueryData(queryKeys.topic('t1'), snoozedTopic);
    qc.setQueryData(queryKeys.agenda(today, 30), [moved]);
    const { result, unmount } = await renderHook(
      () => useUnsnoozeRevision('t1'),
      { wrapper },
    );
    cleanups.push(unmount);
    await act(async () => {
      await expect(
        result.current.mutateAsync({ ...vars, restore: agendaItem }),
      ).rejects.toThrow();
    });
    expect(qc.getQueryData(queryKeys.agenda(today, 30))).toEqual([moved]);
    expect(qc.getQueryData(queryKeys.topic('t1'))).toEqual(snoozedTopic);
  });

  it('queued behind its snooze, it restores the row at once, for good', async () => {
    const gate = deferred<unknown>();
    const post = jest
      .fn()
      .mockImplementationOnce(() => gate.promise)
      .mockResolvedValue({});
    const { qc, today, wrapper } = setup(post);
    qc.setQueryData(queryKeys.agenda(today, 30), [todayItem]);
    const { result, unmount } = await renderHook(
      () => ({
        snooze: useSnoozeRevision('t1'),
        unsnooze: useUnsnoozeRevision('t1'),
      }),
      { wrapper },
    );
    cleanups.push(unmount, () => gate.resolve({}));
    const agenda = () => qc.getQueryData(queryKeys.agenda(today, 30));
    let snoozing: Promise<unknown> = Promise.resolve();
    await act(async () => {
      snoozing = result.current.snooze.mutateAsync(snoozeVars);
    });
    await waitFor(() => expect(agenda()).toEqual([moved]));
    await act(async () => {
      result.current.unsnooze.mutate({
        ...vars,
        dueOn: today,
        restore: todayItem,
        afterSnooze: snoozing,
      });
    });
    await waitFor(() => expect(agenda()).toEqual([todayItem]));
    expect(post).toHaveBeenCalledTimes(1);
    // The snooze's answer must not move the restored row again.
    await act(async () => gate.resolve(snoozedTopic));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1]).toEqual([
      '/v1/topics/t1/revisions/R1/unsnooze',
      { dueOn: today },
    ]);
    expect(agenda()).toEqual([todayItem]);
  });

  it('sends nothing when the snooze it waits for fails', async () => {
    const gate = deferred<unknown>();
    const post = jest.fn().mockImplementationOnce(() => gate.promise);
    const { qc, today, wrapper } = setup(post);
    qc.setQueryData(queryKeys.agenda(today, 30), [todayItem]);
    const { result, unmount } = await renderHook(
      () => ({
        snooze: useSnoozeRevision('t1'),
        unsnooze: useUnsnoozeRevision('t1'),
      }),
      { wrapper },
    );
    cleanups.push(unmount);
    let snoozing: Promise<unknown> = Promise.resolve();
    await act(async () => {
      snoozing = result.current.snooze.mutateAsync(snoozeVars);
      snoozing.catch(() => undefined);
    });
    let undoing: Promise<unknown> = Promise.resolve();
    await act(async () => {
      undoing = result.current.unsnooze.mutateAsync({
        ...vars,
        dueOn: today,
        restore: todayItem,
        afterSnooze: snoozing,
      });
    });
    await act(async () => {
      gate.reject(new ApiError('NETWORK', 0));
      await expect(undoing).resolves.toBeUndefined();
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(queryKeys.agenda(today, 30))).toEqual([todayItem]);
    expect(qc.getQueryData(queryKeys.topic('t1'))).toEqual(topic);
  });

  it('a refetch while the undo is saved keeps the row restored', async () => {
    const gate = deferred<unknown>();
    const post = jest.fn(() => gate.promise);
    const { qc, today } = setup(post);
    // The server still has the snooze until the undo lands.
    const get = jest.fn().mockResolvedValue({ items: [moved] });
    const http = { get, post, patch: jest.fn(), del: jest.fn() } as Http;
    const wrap = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ApiProvider http={http}>{children}</ApiProvider>
      </QueryClientProvider>
    );
    qc.setQueryData(queryKeys.agenda(today, 30), [moved]);
    const { result, unmount } = await renderHook(
      () => ({
        agenda: useAgenda(30, today),
        unsnooze: useUnsnoozeRevision('t1'),
      }),
      { wrapper: wrap },
    );
    cleanups.push(unmount, () => gate.resolve({}));
    await act(async () => {
      result.current.unsnooze.mutate({
        ...vars,
        dueOn: today,
        restore: todayItem,
      });
    });
    await waitFor(() =>
      expect(result.current.agenda.data).toEqual([todayItem]),
    );
    await act(async () => {
      await result.current.agenda.refetch();
    });
    expect(qc.getQueryData(queryKeys.agenda(today, 30))).toEqual([moved]);
    await waitFor(() =>
      expect(result.current.agenda.data).toEqual([todayItem]),
    );
  });
});

describe('a pending Undo and other topics', () => {
  it("is not overwritten by another topic's refetch", async () => {
    const today = '2026-11-13';
    const aR1: AgendaItem = {
      ...agendaItem,
      topicId: 'a',
      topicName: 'A',
      revisionId: 'aR1',
      dueOn: today,
      bucket: 'today',
    };
    const bR1: AgendaItem = {
      ...aR1,
      topicId: 'b',
      topicName: 'B',
      revisionId: 'bR1',
    };
    const aR2: AgendaItem = {
      ...aR1,
      revisionId: 'aR2',
      step: 2,
      dueOn: '2026-11-16',
      bucket: 'upcoming',
    };
    const bR2: AgendaItem = {
      ...aR2,
      topicId: 'b',
      topicName: 'B',
      revisionId: 'bR2',
    };
    const gateA = deferred<unknown>();
    const gateB = deferred<unknown>();
    const gateUndo = deferred<unknown>();
    const post = jest.fn((path: string) =>
      path.includes('/a/')
        ? gateA.promise
        : path.endsWith('/undo')
        ? gateUndo.promise
        : gateB.promise,
    );
    const { qc } = setup(post);
    let server: AgendaItem[] = [aR1, bR1];
    const get = jest.fn(async () => ({ items: server }));
    const http = { get, post, patch: jest.fn(), del: jest.fn() } as Http;
    const wrap = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ApiProvider http={http}>{children}</ApiProvider>
      </QueryClientProvider>
    );
    qc.setQueryData(queryKeys.agenda(today, 30), [aR1, bR1]);
    const { result, unmount } = await renderHook(
      () => ({
        agenda: useAgenda(30, today),
        doneA: useCompleteRevision('a'),
        doneB: useCompleteRevision('b'),
        undoB: useUndoRevision('b'),
      }),
      { wrapper: wrap },
    );
    cleanups.push(unmount, () => {
      gateA.resolve({});
      gateB.resolve({});
      gateUndo.resolve({});
    });
    const ids = () => result.current.agenda.data?.map(i => i.revisionId);
    await act(async () => {
      result.current.doneA.mutate({
        topicId: 'a',
        revisionId: 'aR1',
        doneOn: today,
      });
    });
    let doneB: Promise<unknown> = Promise.resolve();
    await act(async () => {
      doneB = result.current.doneB
        .mutateAsync({ topicId: 'b', revisionId: 'bR1', doneOn: today })
        .catch(() => {});
    });
    await waitFor(() => expect(ids()).toEqual([]));
    await act(async () => {
      result.current.undoB.mutate({
        topicId: 'b',
        revisionId: 'bR1',
        restore: bR1,
        afterDone: doneB,
      });
    });
    await waitFor(() => expect(ids()).toEqual(['bR1']));
    // A is saved and refetches; the server still has B done.
    server = [aR2, bR2];
    await act(async () => gateA.resolve({}));
    await waitFor(() => expect(ids()).toEqual(['bR1', 'aR2']));
    // B's Done lands, then the Undo is sent and lands.
    await act(async () => gateB.resolve({}));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(3));
    expect(ids()).toEqual(['bR1', 'aR2']);
    server = [bR1, aR2];
    const gets = get.mock.calls.length;
    await act(async () => gateUndo.resolve({}));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(gets));
    expect(ids()).toEqual(['bR1', 'aR2']);
  });
});

describe('after sign-out', () => {
  it('a Done answered after sign-out writes nothing', async () => {
    const gate = deferred<unknown>();
    const post = jest.fn(() => gate.promise);
    const { qc, today, wrapper } = setup(post);
    const { result, unmount } = await renderHook(
      () => useCompleteRevision('t1'),
      { wrapper },
    );
    cleanups.push(unmount);
    let saving: Promise<unknown> = Promise.resolve();
    await act(async () => {
      saving = result.current.mutateAsync({
        topicId: 't1',
        revisionId: 'R1',
        doneOn: today,
      });
    });
    await waitFor(() =>
      expect(qc.getQueryData(queryKeys.agenda(today, 30))).toEqual([]),
    );
    endSession();
    const saved: TopicView = { ...topic, name: 'Previous account' };
    await act(async () => {
      gate.resolve(saved);
      await saving;
    });
    expect(qc.getQueryData<TopicView>(queryKeys.topic('t1'))?.name).not.toBe(
      'Previous account',
    );
  });

  it('a failure after sign-out does not roll back', async () => {
    const gate = deferred<unknown>();
    const post = jest.fn(() => gate.promise);
    const { qc, today, wrapper } = setup(post);
    const { result, unmount } = await renderHook(
      () => useCompleteRevision('t1'),
      { wrapper },
    );
    cleanups.push(unmount);
    let saving: Promise<unknown> = Promise.resolve();
    await act(async () => {
      saving = result.current
        .mutateAsync({ topicId: 't1', revisionId: 'R1', doneOn: today })
        .catch(() => {});
    });
    await waitFor(() =>
      expect(qc.getQueryData(queryKeys.agenda(today, 30))).toEqual([]),
    );
    await act(async () => {
      gate.reject(
        new ApiError('UNAUTHENTICATED', 401, undefined, {
          sessionEnded: true,
        }),
      );
      await saving;
    });
    expect(qc.getQueryData(queryKeys.agenda(today, 30))).toEqual([]);
  });
});
