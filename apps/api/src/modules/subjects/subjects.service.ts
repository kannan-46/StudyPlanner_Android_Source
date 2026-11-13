import { ObjectId, type Db } from 'mongodb';
import { nameKey, type SubjectInput, type SubjectView } from '@planner/shared';
import type { AppDeps } from '../../core/deps';
import { AppError } from '../../core/errors/app-error';
import { parseObjectId } from '../../core/db/ids';
import { createSubjectsRepository, toSubjectView } from './subjects.repository';

/** Throws VALIDATION_FAILED (path subjectId) unless the subject is the user's. */
export async function assertSubjectOwned(
  db: Db,
  userId: ObjectId,
  subjectId: string,
): Promise<void> {
  const fail = () =>
    new AppError('VALIDATION_FAILED', { details: [{ path: ['subjectId'] }] });
  if (!/^[0-9a-fA-F]{24}$/.test(subjectId)) throw fail();
  const found = await createSubjectsRepository(db).findOne(
    userId,
    new ObjectId(subjectId),
  );
  if (!found) throw fail();
}

export function createSubjectsService(deps: AppDeps) {
  const repo = async () => createSubjectsRepository(await deps.getDb());
  return {
    async list(userId: ObjectId): Promise<SubjectView[]> {
      const r = await repo();
      const [docs, counts] = await Promise.all([
        r.list(userId),
        r.topicCounts(userId),
      ]);
      return docs.map(d => toSubjectView(d, counts.get(String(d._id)) ?? 0));
    },
    async create(userId: ObjectId, input: SubjectInput): Promise<SubjectView> {
      const r = await repo();
      const doc = await r.insert({
        _id: new ObjectId(),
        userId,
        name: input.name,
        nameKey: nameKey(input.name),
        createdAt: deps.now(),
      });
      return toSubjectView(doc, 0);
    },
    async rename(
      userId: ObjectId,
      id: string,
      input: SubjectInput,
    ): Promise<SubjectView> {
      const r = await repo();
      const oid = parseObjectId(id);
      const doc = await r.rename(userId, oid, input.name, nameKey(input.name));
      if (!doc) throw new AppError('NOT_FOUND');
      return toSubjectView(doc, await r.countTopics(userId, oid));
    },
    async remove(userId: ObjectId, id: string): Promise<void> {
      const r = await repo();
      const oid = parseObjectId(id);
      if (!(await r.findOne(userId, oid))) throw new AppError('NOT_FOUND');
      if ((await r.countTopics(userId, oid)) > 0) {
        throw new AppError('SUBJECT_IN_USE');
      }
      await r.delete(userId, oid);
    },
  };
}
