import { type Db, type ObjectId } from 'mongodb';
import type { LocalDate, MockTestView } from '@planner/shared';

export interface MockTestDoc {
  _id: ObjectId;
  userId: ObjectId;
  title: string;
  takenOn: LocalDate;
  score: number;
  maxScore: number;
  examId: ObjectId | null;
  notes: string;
  createdAt: Date;
  /**
   * Set on imported mock tests: the backup record they came from (a v1 file
   * id or a 'legacy:' key). A later merge of the same file skips them.
   */
  sourceId?: string;
}

export type MockTestPatch = Partial<
  Pick<
    MockTestDoc,
    'title' | 'takenOn' | 'score' | 'maxScore' | 'examId' | 'notes'
  >
>;

export function toMockTestView(doc: MockTestDoc): MockTestView {
  return {
    id: doc._id.toHexString(),
    title: doc.title,
    takenOn: doc.takenOn,
    score: doc.score,
    maxScore: doc.maxScore,
    percent: Math.round((doc.score / doc.maxScore) * 1000) / 10,
    examId: doc.examId ? doc.examId.toHexString() : null,
    notes: doc.notes,
  };
}

export function createMockTestsRepository(db: Db) {
  const col = db.collection<MockTestDoc>('mockTests');
  return {
    list(userId: ObjectId): Promise<MockTestDoc[]> {
      return col.find({ userId }).sort({ takenOn: -1, _id: -1 }).toArray();
    },
    count(userId: ObjectId): Promise<number> {
      return col.countDocuments({ userId });
    },
    async insert(doc: MockTestDoc): Promise<MockTestDoc> {
      await col.insertOne(doc);
      return doc;
    },
    findOwned(userId: ObjectId, id: ObjectId): Promise<MockTestDoc | null> {
      return col.findOne({ _id: id, userId });
    },
    update(
      userId: ObjectId,
      id: ObjectId,
      set: MockTestPatch,
    ): Promise<MockTestDoc | null> {
      return col.findOneAndUpdate(
        { _id: id, userId },
        { $set: set },
        { returnDocument: 'after' },
      );
    },
    async delete(userId: ObjectId, id: ObjectId): Promise<boolean> {
      return (await col.deleteOne({ _id: id, userId })).deletedCount > 0;
    },
  };
}
