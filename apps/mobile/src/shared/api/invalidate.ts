import type { QueryClient } from '@tanstack/react-query';

/*
 * Each helper comes in two forms:
 * - `invalidateX` starts the refresh in the background and does not wait for
 *   it. Use it in a mutation's onSettled: TanStack Query waits for a promise
 *   returned from onSettled, so returning the refresh itself would keep the
 *   save's spinner going until every list had reloaded (about 3 s when
 *   offline, because each refetch retries). It returns an already-resolved
 *   promise, so existing `.catch(() => {})` calls keep working and nothing
 *   waits on it.
 * - `refreshX` returns a promise that settles when the lists have reloaded,
 *   for the rare caller that must wait for fresh data.
 */

/** Settles at once: what the background helpers return. */
const DONE: Promise<void> = Promise.resolve();

export type TopicDataOptions = {
  /** The topic was deleted: mark it stale without refetching it (a 404). */
  deleted?: boolean;
};

/** topic or revision changes -> topics, topic(id), agenda, stats */
export function refreshTopicData(
  qc: QueryClient,
  topicId?: string,
  opts: TopicDataOptions = {},
): Promise<void> {
  const topicKey = topicId ? ['topic', topicId] : ['topic'];
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['topics'] }),
    qc.invalidateQueries(
      opts.deleted
        ? { queryKey: topicKey, refetchType: 'none' }
        : { queryKey: topicKey },
    ),
    qc.invalidateQueries({ queryKey: ['agenda'] }),
    qc.invalidateQueries({ queryKey: ['stats'] }),
  ]).then(() => undefined);
}

export function invalidateTopicData(
  qc: QueryClient,
  topicId?: string,
  opts?: TopicDataOptions,
): Promise<void> {
  refreshTopicData(qc, topicId, opts).catch(() => {});
  return DONE;
}

export type ExamSubjectDataOptions = {
  /**
   * Also refresh topic lists (default true). Only deleting an exam changes
   * topics (the server removes it from their exams); renames, date changes
   * and new exams or subjects can pass false.
   */
  topics?: boolean;
};

/** exam or subject changes -> exams, subjects, (topics) */
export function refreshExamSubjectData(
  qc: QueryClient,
  opts: ExamSubjectDataOptions = {},
): Promise<void> {
  const tasks = [
    qc.invalidateQueries({ queryKey: ['exams'] }),
    qc.invalidateQueries({ queryKey: ['subjects'] }),
  ];
  if (opts.topics !== false) {
    tasks.push(qc.invalidateQueries({ queryKey: ['topics'] }));
  }
  return Promise.all(tasks).then(() => undefined);
}

export function invalidateExamSubjectData(
  qc: QueryClient,
  opts?: ExamSubjectDataOptions,
): Promise<void> {
  refreshExamSubjectData(qc, opts).catch(() => {});
  return DONE;
}

/** mock test changes -> mockTests, stats */
export function refreshMockTestData(qc: QueryClient): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['mockTests'] }),
    qc.invalidateQueries({ queryKey: ['stats'] }),
  ]).then(() => undefined);
}

export function invalidateMockTestData(qc: QueryClient): Promise<void> {
  refreshMockTestData(qc).catch(() => {});
  return DONE;
}
