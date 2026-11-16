import { type Db, type ObjectId } from 'mongodb';
import type { ExamView, LocalDate } from '@planner/shared';
import { AppError } from '../../core/errors/app-error';

export interface ExamDoc {
  _id: ObjectId;
  userId: ObjectId;
  name: string;
  nameKey: string;
  examDate: LocalDate | null;
  createdAt: Date;
}

export type ExamPatch = Partial<Pick<ExamDoc, 'name' | 'nameKey' | 'examDate'>>;

export function toExamView(doc: ExamDoc): ExamView {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    examDate: doc.examDate ?? null,
  };
}

function rethrowDuplicate(e: unknown): never {
  if ((e as { code?: number } | null)?.code === 11000) {
    throw new AppError('DUPLICATE_NAME');
  }
  throw e;
}

export function createExamsRepository(db: Db) {
  const col = db.collection<ExamDoc>('exams');
  return {
    list(userId: ObjectId): Promise<ExamDoc[]> {
      return col.find({ userId }).sort({ nameKey: 1 }).toArray();
    },
    async insert(doc: ExamDoc): Promise<ExamDoc> {
      try {
        await col.insertOne(doc);
      } catch (e) {
        rethrowDuplicate(e);
      }
      return doc;
    },
    async update(
      userId: ObjectId,
      id: ObjectId,
      set: ExamPatch,
    ): Promise<ExamDoc | null> {
      try {
        if (Object.keys(set).length === 0) {
          return await col.findOne({ _id: id, userId });
        }
        return await col.findOneAndUpdate(
          { _id: id, userId },
          { $set: set },
          { returnDocument: 'after' },
        );
      } catch (e) {
        rethrowDuplicate(e);
      }
    },
    async delete(userId: ObjectId, id: ObjectId): Promise<boolean> {
      const res = await col.deleteOne({ _id: id, userId });
      if (res.deletedCount === 0) return false;
      await db
        .collection<{ examIds: ObjectId[] }>('topics')
        .updateMany({ userId, examIds: id }, { $pull: { examIds: id } });
      await db
        .collection<{ examId: ObjectId | null }>('mockTests')
        .updateMany({ userId, examId: id }, { $set: { examId: null } });
      return true;
    },
    countOwned(userId: ObjectId, ids: ObjectId[]): Promise<number> {
      return col.countDocuments({ userId, _id: { $in: ids } });
    },
  };
}
