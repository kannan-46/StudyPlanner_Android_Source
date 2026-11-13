import type { QueryClient } from '@tanstack/react-query';

/** topic or revision changes -> topics, topic(id), agenda, stats */
export function invalidateTopicData(qc: QueryClient, topicId?: string) {
  const tasks = [
    qc.invalidateQueries({ queryKey: ['topics'] }),
    qc.invalidateQueries({
      queryKey: topicId ? ['topic', topicId] : ['topic'],
    }),
    qc.invalidateQueries({ queryKey: ['agenda'] }),
    qc.invalidateQueries({ queryKey: ['stats'] }),
  ];
  return Promise.all(tasks);
}

/** exam or subject changes -> exams, subjects, topics */
export function invalidateExamSubjectData(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['exams'] }),
    qc.invalidateQueries({ queryKey: ['subjects'] }),
    qc.invalidateQueries({ queryKey: ['topics'] }),
  ]);
}

/** mock test changes -> mockTests, stats */
export function invalidateMockTestData(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['mockTests'] }),
    qc.invalidateQueries({ queryKey: ['stats'] }),
  ]);
}
