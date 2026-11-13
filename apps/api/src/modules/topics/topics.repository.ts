import { ObjectId, type Db, type Filter } from 'mongodb';
import type { TopicListQuery } from '@planner/shared';
import { AppError } from '../../core/errors/app-error';
import { parseObjectId } from '../../core/db/ids';
import type { TopicDoc } from './topic.mapper';

const COLLATION = { locale: 'en', strength: 2 } as const;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createTopicsRepository(db: Db) {
  const col = db.collection<TopicDoc>('topics');
  return {
    list(userId: ObjectId, query: TopicListQuery): Promise<TopicDoc[]> {
      const filter: Filter<TopicDoc> = { userId };
      if (query.subjectId) filter.subjectId = new ObjectId(query.subjectId);
      if (query.examId) filter.examIds = new ObjectId(query.examId);
      if (query.status) filter.status = query.status;
      if (query.q) {
        filter.name = { $regex: escapeRegex(query.q), $options: 'i' };
      }
      return col
        .find(filter)
        .collation(COLLATION)
        .sort({ name: 1, _id: 1 })
        .toArray();
    },
    async findOwned(userId: ObjectId, id: string): Promise<TopicDoc> {
      const doc = await col.findOne({ _id: parseObjectId(id), userId });
      if (!doc) throw new AppError('NOT_FOUND');
      return doc;
    },
    async insert(doc: TopicDoc): Promise<TopicDoc> {
      await col.insertOne(doc);
      return doc;
    },
    countForUser(userId: ObjectId): Promise<number> {
      return col.countDocuments({ userId });
    },
    async deleteOwned(userId: ObjectId, id: string): Promise<void> {
      const res = await col.deleteOne({ _id: parseObjectId(id), userId });
      if (res.deletedCount === 0) throw new AppError('NOT_FOUND');
    },
    async replaceIfVersion(
      userId: ObjectId,
      id: string,
      version: number,
      next: Partial<TopicDoc>,
    ): Promise<boolean> {
      const set = { ...next };
      delete set._id;
      delete set.version;
      const res = await col.updateOne(
        { _id: parseObjectId(id), userId, version },
        { $set: set, $inc: { version: 1 } },
      );
      return res.modifiedCount > 0;
    },
  };
}
