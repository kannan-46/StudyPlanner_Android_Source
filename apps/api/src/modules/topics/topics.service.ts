import { ObjectId } from 'mongodb';
import {
  compareDates,
  completeRevision,
  snoozeRevision,
  undoRevision,
  unsnoozeRevision,
  createSchedule,
  reconcileSchedule,
  type TopicCreateInput,
  type TopicListQuery,
  type TopicUpdateInput,
  type TopicView,
} from '@planner/shared';
import type { AppDeps } from '../../core/deps';
import { AppError } from '../../core/errors/app-error';
import { assertExamsOwned } from '../exams/exams.service';
import { assertSubjectOwned } from '../subjects/subjects.service';
import { createUsersRepository } from '../users/users.repository';
import { toTopicView, type TopicDoc } from './topic.mapper';
import { createTopicsRepository } from './topics.repository';

const MAX_TOPICS = 5000;
const newId = () => new ObjectId().toHexString();
const toObjectIds = (ids: string[]) =>
  [...new Set(ids)].map(id => new ObjectId(id));

export function createTopicsService(deps: AppDeps) {
  async function ctx() {
    const db = await deps.getDb();
    return { db, repo: createTopicsRepository(db) };
  }

  /**
   * Load, apply `fn`, and write with an optimistic version check. One reload
   * and retry on a version miss; a second miss is a 409.
   */
  async function mutateWithRetry(
    userId: ObjectId,
    id: string,
    fn: (doc: TopicDoc) => Partial<TopicDoc> | Promise<Partial<TopicDoc>>,
  ): Promise<TopicDoc> {
    const { repo } = await ctx();
    for (let attempt = 0; attempt < 2; attempt++) {
      const doc = await repo.findOwned(userId, id);
      const next = { ...(await fn(doc)), updatedAt: deps.now() };
      if (await repo.replaceIfVersion(userId, id, doc.version, next)) {
        return { ...doc, ...next, version: doc.version + 1 };
      }
    }
    throw new AppError('VERSION_CONFLICT');
  }

  const scheduleOf = (d: TopicDoc) => ({
    studiedOn: d.studiedOn,
    intervals: d.intervals,
    revisions: d.revisions,
  });

  return {
    mutateWithRetry,

    async completeRevision(
      userId: ObjectId,
      id: string,
      revisionId: string,
      doneOn: string,
    ): Promise<TopicView> {
      return toTopicView(
        await mutateWithRetry(userId, id, d =>
          completeRevision(scheduleOf(d), revisionId, doneOn),
        ),
      );
    },

    async undoRevision(
      userId: ObjectId,
      id: string,
      revisionId: string,
    ): Promise<TopicView> {
      return toTopicView(
        await mutateWithRetry(userId, id, d =>
          undoRevision(scheduleOf(d), revisionId),
        ),
      );
    },

    async snoozeRevision(
      userId: ObjectId,
      id: string,
      revisionId: string,
      today: string,
      days: number,
    ): Promise<TopicView> {
      return toTopicView(
        await mutateWithRetry(userId, id, d =>
          snoozeRevision(scheduleOf(d), revisionId, today, days),
        ),
      );
    },

    async unsnoozeRevision(
      userId: ObjectId,
      id: string,
      revisionId: string,
      dueOn: string,
    ): Promise<TopicView> {
      return toTopicView(
        await mutateWithRetry(userId, id, d =>
          unsnoozeRevision(scheduleOf(d), revisionId, dueOn),
        ),
      );
    },

    async list(userId: ObjectId, query: TopicListQuery): Promise<TopicView[]> {
      const { repo } = await ctx();
      return (await repo.list(userId, query)).map(toTopicView);
    },

    async get(userId: ObjectId, id: string): Promise<TopicView> {
      const { repo } = await ctx();
      return toTopicView(await repo.findOwned(userId, id));
    },

    async create(
      userId: ObjectId,
      input: TopicCreateInput,
    ): Promise<TopicView> {
      const { db, repo } = await ctx();
      if ((await repo.countForUser(userId)) >= MAX_TOPICS) {
        throw new AppError('LIMIT_EXCEEDED');
      }
      await assertSubjectOwned(db, userId, input.subjectId);
      await assertExamsOwned(db, userId, input.examIds);
      let intervals = input.intervals;
      if (!intervals) {
        const user = await createUsersRepository(db).findById(userId);
        if (!user) throw new AppError('NOT_FOUND');
        intervals = user.settings.intervals;
      }
      const schedule = createSchedule(input.studiedOn, intervals, newId);
      const now = deps.now();
      const doc = await repo.insert({
        _id: new ObjectId(),
        userId,
        name: input.name,
        subjectId: new ObjectId(input.subjectId),
        examIds: toObjectIds(input.examIds),
        studiedOn: input.studiedOn,
        intervals,
        notes: input.notes,
        revisions: schedule.revisions,
        nextDueOn: schedule.nextDueOn,
        status: schedule.status,
        version: 0,
        createdAt: now,
        updatedAt: now,
      });
      return toTopicView(doc);
    },

    async update(
      userId: ObjectId,
      id: string,
      patch: TopicUpdateInput,
    ): Promise<TopicView> {
      const { db } = await ctx();
      if (patch.subjectId !== undefined) {
        await assertSubjectOwned(db, userId, patch.subjectId);
      }
      if (patch.examIds !== undefined) {
        await assertExamsOwned(db, userId, patch.examIds);
      }
      const doc = await mutateWithRetry(userId, id, current => {
        const next: Partial<TopicDoc> = {};
        if (patch.name !== undefined) next.name = patch.name;
        if (patch.notes !== undefined) next.notes = patch.notes;
        if (patch.subjectId !== undefined) {
          next.subjectId = new ObjectId(patch.subjectId);
        }
        if (patch.examIds !== undefined) {
          next.examIds = toObjectIds(patch.examIds);
        }
        const datesChanged =
          (patch.studiedOn !== undefined &&
            patch.studiedOn !== current.studiedOn) ||
          (patch.intervals !== undefined &&
            (patch.intervals.length !== current.intervals.length ||
              patch.intervals.some((n, i) => n !== current.intervals[i])));
        if (datesChanged) {
          const studiedOn = patch.studiedOn ?? current.studiedOn;
          const intervals = patch.intervals ?? current.intervals;
          const earliest = current.revisions
            .map(r => r.doneOn)
            .filter((d): d is string => d !== null)
            .sort(compareDates)[0];
          if (earliest !== undefined && compareDates(studiedOn, earliest) > 0) {
            throw new AppError('VALIDATION_FAILED', {
              details: [
                {
                  path: ['studiedOn'],
                  message: 'studiedOn cannot be after a completed revision',
                },
              ],
            });
          }
          const doneCount = current.revisions.filter(
            r => r.doneOn !== null,
          ).length;
          if (intervals.length < doneCount) {
            throw new AppError('VALIDATION_FAILED', {
              details: [
                {
                  path: ['intervals'],
                  message:
                    'intervals cannot have fewer entries than completed revisions',
                },
              ],
            });
          }
          const schedule = reconcileSchedule(
            {
              studiedOn: current.studiedOn,
              intervals: current.intervals,
              revisions: current.revisions,
            },
            { studiedOn, intervals },
            newId,
          );
          next.studiedOn = studiedOn;
          next.intervals = intervals;
          next.revisions = schedule.revisions;
          next.nextDueOn = schedule.nextDueOn;
          next.status = schedule.status;
        }
        return next;
      });
      return toTopicView(doc);
    },

    async remove(userId: ObjectId, id: string): Promise<void> {
      const { repo } = await ctx();
      await repo.deleteOwned(userId, id);
    },
  };
}
