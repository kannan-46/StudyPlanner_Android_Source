import { ObjectId, type Db } from 'mongodb';
import {
  mockTestInputSchema,
  type MockTestInput,
  type MockTestUpdate,
  type MockTestView,
} from '@planner/shared';
import type { AppDeps } from '../../core/deps';
import { AppError } from '../../core/errors/app-error';
import { parseObjectId } from '../../core/db/ids';
import { createExamsRepository } from '../exams/exams.repository';
import { assertExamsOwned } from '../exams/exams.service';
import {
  createMockTestsRepository,
  toMockTestView,
  type MockTestPatch,
} from './mockTests.repository';

const MAX_MOCK_TESTS = 2000;

async function assertExamOwned(
  db: Db,
  userId: ObjectId,
  examId: string | null | undefined,
): Promise<void> {
  if (!examId) return;
  try {
    await assertExamsOwned(db, userId, [examId]);
  } catch (e) {
    if (e instanceof AppError && e.code === 'VALIDATION_FAILED') {
      throw new AppError('VALIDATION_FAILED', {
        details: [{ path: ['examId'] }],
      });
    }
    throw e;
  }
}

export function createMockTestsService(deps: AppDeps) {
  const ctx = async () => {
    const db = await deps.getDb();
    return { db, repo: createMockTestsRepository(db) };
  };
  return {
    async list(userId: ObjectId): Promise<MockTestView[]> {
      const { db, repo } = await ctx();
      const [docs, exams] = await Promise.all([
        repo.list(userId),
        createExamsRepository(db).list(userId),
      ]);
      // Older data can still point at a deleted exam; show it as no exam.
      const examIds = new Set(exams.map(e => e._id.toHexString()));
      return docs.map(d =>
        d.examId && !examIds.has(d.examId.toHexString())
          ? toMockTestView({ ...d, examId: null })
          : toMockTestView(d),
      );
    },
    async create(
      userId: ObjectId,
      input: MockTestInput,
    ): Promise<MockTestView> {
      const { db, repo } = await ctx();
      if ((await repo.count(userId)) >= MAX_MOCK_TESTS) {
        throw new AppError('LIMIT_EXCEEDED');
      }
      await assertExamOwned(db, userId, input.examId);
      const doc = await repo.insert({
        _id: new ObjectId(),
        userId,
        title: input.title,
        takenOn: input.takenOn,
        score: input.score,
        maxScore: input.maxScore,
        examId: input.examId ? new ObjectId(input.examId) : null,
        notes: input.notes,
        createdAt: deps.now(),
      });
      return toMockTestView(doc);
    },
    async update(
      userId: ObjectId,
      id: string,
      input: MockTestUpdate,
    ): Promise<MockTestView> {
      const { db, repo } = await ctx();
      const oid = parseObjectId(id);
      const stored = await repo.findOwned(userId, oid);
      if (!stored) throw new AppError('NOT_FOUND');
      // Merge, then re-validate so score <= maxScore holds on the result.
      const merged = mockTestInputSchema.parse({
        title: input.title ?? stored.title,
        takenOn: input.takenOn ?? stored.takenOn,
        score: input.score ?? stored.score,
        maxScore: input.maxScore ?? stored.maxScore,
        examId:
          input.examId !== undefined
            ? input.examId
            : (stored.examId?.toHexString() ?? null),
        notes: input.notes ?? stored.notes,
      });
      let examId = merged.examId ?? null;
      const storedExamId = stored.examId?.toHexString() ?? null;
      if (examId !== null && examId === storedExamId) {
        // The stored exam may have been deleted (older data, or a stale form
        // sending it back): drop the link instead of refusing the save.
        const owned = await createExamsRepository(db).countOwned(userId, [
          new ObjectId(examId),
        ]);
        if (owned === 0) examId = null;
      } else if (input.examId !== undefined) {
        await assertExamOwned(db, userId, input.examId);
      }
      const set: MockTestPatch = {
        title: merged.title,
        takenOn: merged.takenOn,
        score: merged.score,
        maxScore: merged.maxScore,
        examId: examId ? new ObjectId(examId) : null,
        notes: merged.notes,
      };
      const doc = await repo.update(userId, oid, set);
      if (!doc) throw new AppError('NOT_FOUND');
      return toMockTestView(doc);
    },
    async remove(userId: ObjectId, id: string): Promise<void> {
      const { repo } = await ctx();
      if (!(await repo.delete(userId, parseObjectId(id)))) {
        throw new AppError('NOT_FOUND');
      }
    },
  };
}
