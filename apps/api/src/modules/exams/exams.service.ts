import { ObjectId, type Db } from 'mongodb';
import {
  nameKey,
  type ExamInput,
  type ExamUpdate,
  type ExamView,
} from '@planner/shared';
import type { AppDeps } from '../../core/deps';
import { AppError } from '../../core/errors/app-error';
import { parseObjectId } from '../../core/db/ids';
import {
  createExamsRepository,
  toExamView,
  type ExamPatch,
} from './exams.repository';

/** Throws VALIDATION_FAILED (path examIds) unless all ids are the user's exams. */
export async function assertExamsOwned(
  db: Db,
  userId: ObjectId,
  examIds: string[],
): Promise<void> {
  const fail = () =>
    new AppError('VALIDATION_FAILED', { details: [{ path: ['examIds'] }] });
  const unique = [...new Set(examIds)];
  if (unique.length === 0) return;
  if (unique.some(id => !/^[0-9a-fA-F]{24}$/.test(id))) throw fail();
  const count = await createExamsRepository(db).countOwned(
    userId,
    unique.map(id => new ObjectId(id)),
  );
  if (count !== unique.length) throw fail();
}

export function createExamsService(deps: AppDeps) {
  const repo = async () => createExamsRepository(await deps.getDb());
  return {
    async list(userId: ObjectId): Promise<ExamView[]> {
      return (await (await repo()).list(userId)).map(toExamView);
    },
    async create(userId: ObjectId, input: ExamInput): Promise<ExamView> {
      const r = await repo();
      const doc = await r.insert({
        _id: new ObjectId(),
        userId,
        name: input.name,
        nameKey: nameKey(input.name),
        examDate: input.examDate ?? null,
        createdAt: deps.now(),
      });
      return toExamView(doc);
    },
    async update(
      userId: ObjectId,
      id: string,
      input: ExamUpdate,
    ): Promise<ExamView> {
      const set: ExamPatch = {};
      if (input.name !== undefined) {
        set.name = input.name;
        set.nameKey = nameKey(input.name);
      }
      if (input.examDate !== undefined) set.examDate = input.examDate;
      const doc = await (await repo()).update(userId, parseObjectId(id), set);
      if (!doc) throw new AppError('NOT_FOUND');
      return toExamView(doc);
    },
    async remove(userId: ObjectId, id: string): Promise<void> {
      const ok = await (await repo()).delete(userId, parseObjectId(id));
      if (!ok) throw new AppError('NOT_FOUND');
    },
  };
}
