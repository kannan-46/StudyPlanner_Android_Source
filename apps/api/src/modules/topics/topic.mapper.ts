import type { ObjectId } from 'mongodb';
import type { LocalDate, RevisionState, TopicView } from '@planner/shared';

export interface TopicDoc {
  _id: ObjectId;
  userId: ObjectId;
  name: string;
  subjectId: ObjectId;
  examIds: ObjectId[];
  studiedOn: LocalDate;
  intervals: number[];
  notes: string;
  revisions: RevisionState[];
  nextDueOn: LocalDate | null;
  status: 'active' | 'completed';
  version: number;
  legacyId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toTopicView(doc: TopicDoc): TopicView {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    subjectId: doc.subjectId.toHexString(),
    examIds: doc.examIds.map(e => e.toHexString()),
    studiedOn: doc.studiedOn,
    intervals: doc.intervals,
    notes: doc.notes,
    revisions: doc.revisions,
    nextDueOn: doc.nextDueOn,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
