import { MutationObserver, QueryObserver } from '@tanstack/react-query';
import { ApiError } from '../errors';
import {
  invalidateExamSubjectData,
  invalidateMockTestData,
  invalidateTopicData,
  refreshTopicData,
} from '../invalidate';
import { createQueryClient } from '../queryClient';

const clients: ReturnType<typeof createQueryClient>[] = [];
function client() {
  const qc = createQueryClient();
  clients.push(qc);
  return qc;
}
afterEach(async () => {
  jest.useRealTimers();
  for (const qc of clients.splice(0)) {
    await qc.cancelQueries();
    qc.clear();
  }
});

/** Keeps a query active, like a mounted screen. */
function watch(
  qc: ReturnType<typeof createQueryClient>,
  queryKey: unknown[],
  queryFn: () => Promise<unknown>,
) {
  const obs = new QueryObserver(qc, { queryKey, queryFn });
  const unsubscribe = obs.subscribe(() => {});
  return unsubscribe;
}

it('the invalidate helpers settle at once, before the lists reload', async () => {
  const qc = client();
  const never = () => new Promise<unknown>(() => {});
  const stop = watch(qc, ['topics', {}], never);
  const stop2 = watch(qc, ['mockTests'], never);
  let settled = 0;
  const mark = () => {
    settled += 1;
  };
  invalidateTopicData(qc, 't1').then(mark);
  invalidateExamSubjectData(qc).then(mark);
  invalidateMockTestData(qc).then(mark);
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).toBe(3);
  stop();
  stop2();
});

it('a failed save settles at once, not after every list has retried', async () => {
  jest.useFakeTimers();
  const qc = client();
  const offline = () => Promise.reject(new ApiError('NETWORK', 0));
  const stops = [
    watch(qc, ['topics', {}], offline),
    watch(qc, ['agenda', '2026-11-16', 30], offline),
    watch(qc, ['stats', '2026-11-16'], offline),
  ];
  await jest.advanceTimersByTimeAsync(10_000);
  const save = new MutationObserver(qc, {
    mutationFn: offline,
    onSettled: () => invalidateTopicData(qc),
  });
  let settledAt: number | null = null;
  const start = Date.now();
  save.mutate().catch(() => {
    settledAt = Date.now() - start;
  });
  await jest.advanceTimersByTimeAsync(0);
  await jest.advanceTimersByTimeAsync(0);
  // Before the change this took about 3 s (each list retried 1 s + 2 s).
  expect(settledAt).toBe(0);
  stops.forEach(s => s());
});

it('refreshTopicData waits for the lists to reload', async () => {
  const qc = client();
  let loads = 0;
  const fn = jest.fn(async () => {
    await new Promise<void>(r => setTimeout(() => r(), 10));
    loads += 1;
    return [];
  });
  const stop = watch(qc, ['topics', {}], fn);
  await qc.fetchQuery({ queryKey: ['topics', {}], queryFn: fn });
  expect(loads).toBe(1);
  await refreshTopicData(qc);
  expect(loads).toBe(2);
  stop();
});

it('a deleted topic is marked stale but not loaded again', async () => {
  const qc = client();
  const topicFn = jest.fn(async () => ({ id: 't1' }));
  const stop = watch(qc, ['topic', 't1'], topicFn);
  await refreshTopicData(qc);
  await new Promise<void>(r => setTimeout(() => r(), 0));
  const calls = topicFn.mock.calls.length;
  await refreshTopicData(qc, 't1', { deleted: true });
  expect(topicFn).toHaveBeenCalledTimes(calls);
  expect(qc.getQueryState(['topic', 't1'])?.isInvalidated).toBe(true);
  stop();
});

it('exam and subject changes can skip reloading topics', async () => {
  const qc = client();
  const spy = jest.spyOn(qc, 'invalidateQueries');
  invalidateExamSubjectData(qc, { topics: false });
  expect(spy.mock.calls.map(c => c[0]?.queryKey)).toEqual([
    ['exams'],
    ['subjects'],
  ]);
  spy.mockClear();
  invalidateExamSubjectData(qc);
  expect(spy.mock.calls.map(c => c[0]?.queryKey)).toEqual([
    ['exams'],
    ['subjects'],
    ['topics'],
  ]);
});
