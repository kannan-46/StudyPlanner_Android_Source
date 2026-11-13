import type {PlannerDocument, Revision, Topic} from '../types/planner';

export type RevisionRow = Revision & {
  topicId: string;
  topicName: string;
  exam: Topic['exam'];
  subject: string;
  revisionIndex: number;
};

export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

export function allRevisions(planner: PlannerDocument): RevisionRow[] {
  return planner.topics.flatMap(topic =>
    topic.revisions.map((revision, revisionIndex) => ({
      ...revision,
      topicId: topic.id,
      topicName: topic.name,
      exam: topic.exam,
      subject: topic.subject,
      revisionIndex,
    })),
  );
}

export function dueRevisions(planner: PlannerDocument, today = localDateString()): RevisionRow[] {
  return allRevisions(planner)
    .filter(revision => !revision.done && revision.date <= today)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function completedRevisionCount(planner: PlannerDocument): number {
  return allRevisions(planner).filter(revision => revision.done).length;
}

export function totalRevisionCount(planner: PlannerDocument): number {
  return allRevisions(planner).length;
}

export function reviseTopicSchedule(
  topic: Topic,
  studyDate: string,
  intervals: number[],
): Revision[] {
  return intervals.map(day => {
    const previous = topic.revisions.find(revision => revision.day === day);
    return {
      day,
      date: addDays(studyDate, day),
      done: previous?.done ?? false,
      ...(previous?.completedAt ? {completedAt: previous.completedAt} : {}),
    };
  });
}
