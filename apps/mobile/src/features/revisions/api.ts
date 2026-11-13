import type { TopicView } from '@planner/shared';
import type { Http } from '../../shared/api/http';

export function makeRevisionsApi(http: Http) {
  const base = (topicId: string, revisionId: string) =>
    `/v1/topics/${topicId}/revisions/${revisionId}`;
  return {
    complete: (topicId: string, revisionId: string, doneOn: string) =>
      http.post<TopicView>(`${base(topicId, revisionId)}/complete`, { doneOn }),
    undo: (topicId: string, revisionId: string) =>
      http.post<TopicView>(`${base(topicId, revisionId)}/undo`),
    snooze: (
      topicId: string,
      revisionId: string,
      today: string,
      days: number,
    ) =>
      http.post<TopicView>(`${base(topicId, revisionId)}/snooze`, {
        today,
        days,
      }),
  };
}
