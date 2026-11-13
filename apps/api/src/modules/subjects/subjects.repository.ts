import type { Db, ObjectId } from 'mongodb';
import type { SubjectView } from '@planner/shared';
import { AppError } from '../../core/errors/app-error';

export interface SubjectDoc {
  _id: ObjectId;
  userId: ObjectId;
  name: string;
  nameKey: string;
  createdAt: Date;
}

export function toSubjectView(
  doc: SubjectDoc,
  topicCount: number,
): SubjectView {
  return { id: doc._id.toHexString(), name: doc.name, topicCount };
}

function rethrowDuplicate(e: unknown): never {
  if ((e as { code?: number } | null)?.code === 11000) {
    throw new AppError('DUPLICATE_NAME');
  }
  throw e;
}

export function createSubjectsRepository(db: Db) {
  const col = db.collection<SubjectDoc>('subjects');
  const topics = db.collection('topics');
  return {
    list(userId: ObjectId): Promise<SubjectDoc[]> {
      return col.find({ userId }).sort({ nameKey: 1 }).toArray();
    },
    async topicCounts(userId: ObjectId): Promise<Map<string, number>> {
      const rows = await topics
        .aggregate<{ _id: ObjectId; n: number }>([
          { $match: { userId } },
          { $group: { _id: '$subjectId', n: { $sum: 1 } } },
        ])
        .toArray();
      return new Map(rows.map(r => [String(r._id), r.n]));
    },
    countTopics(userId: ObjectId, subjectId: ObjectId): Promise<number> {
      return topics.countDocuments({ userId, subjectId });
    },
    async insert(doc: SubjectDoc): Promise<SubjectDoc> {
      try {
        await col.insertOne(doc);
      } catch (e) {
        rethrowDuplicate(e);
      }
      return doc;
    },
    async rename(
      userId: ObjectId,
      id: ObjectId,
      name: string,
      key: string,
    ): Promise<SubjectDoc | null> {
      try {
        return await col.findOneAndUpdate(
          { _id: id, userId },
          { $set: { name, nameKey: key } },
          { returnDocument: 'after' },
        );
      } catch (e) {
        rethrowDuplicate(e);
      }
    },
    findOne(userId: ObjectId, id: ObjectId): Promise<SubjectDoc | null> {
      return col.findOne({ _id: id, userId });
    },
    async delete(userId: ObjectId, id: ObjectId): Promise<boolean> {
      return (await col.deleteOne({ _id: id, userId })).deletedCount > 0;
    },
  };
}
