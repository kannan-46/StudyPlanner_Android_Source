import type { ObjectId } from 'mongodb';
import type { StatsView } from '@planner/shared';
import type { AppDeps } from '../../core/deps';
import type { TopicDoc } from '../topics/topic.mapper';

interface Totals {
  topics: number;
  activeTopics: number;
  completedTopics: number;
  revisionsDone: number;
  revisionsPending: number;
  overdue: number;
  dueToday: number;
}
interface Named {
  _id: ObjectId;
  name: string;
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

const countIf = (cond: object) => ({ $sum: { $cond: [cond, 1, 0] } });
const countRevisions = (op: '$eq' | '$ne') => ({
  $sum: {
    $size: {
      $filter: {
        input: '$revisions',
        cond: { [op]: ['$$this.doneOn', null] },
      },
    },
  },
});

export function createStatsService(deps: AppDeps) {
  return {
    async get(userId: ObjectId, today: string): Promise<StatsView> {
      const db = await deps.getDb();
      const [agg] = await db
        .collection<TopicDoc>('topics')
        .aggregate<{
          totals: Totals[];
          subjects: { _id: ObjectId; n: number }[];
          exams: { _id: ObjectId; n: number }[];
        }>([
          { $match: { userId } },
          {
            $facet: {
              totals: [
                {
                  $group: {
                    _id: null,
                    topics: { $sum: 1 },
                    activeTopics: countIf({ $eq: ['$status', 'active'] }),
                    completedTopics: countIf({ $eq: ['$status', 'completed'] }),
                    revisionsDone: countRevisions('$ne'),
                    revisionsPending: countRevisions('$eq'),
                    overdue: countIf({
                      $and: [
                        { $eq: ['$status', 'active'] },
                        { $ne: ['$nextDueOn', null] },
                        { $lt: ['$nextDueOn', today] },
                      ],
                    }),
                    dueToday: countIf({
                      $and: [
                        { $eq: ['$status', 'active'] },
                        { $eq: ['$nextDueOn', today] },
                      ],
                    }),
                  },
                },
              ],
              subjects: [{ $group: { _id: '$subjectId', n: { $sum: 1 } } }],
              exams: [
                { $unwind: '$examIds' },
                { $group: { _id: '$examIds', n: { $sum: 1 } } },
              ],
            },
          },
        ])
        .toArray();
      const t = agg?.totals[0];
      const subjectCounts = new Map(
        (agg?.subjects ?? []).map(s => [String(s._id), s.n]),
      );
      const examCounts = new Map(
        (agg?.exams ?? []).map(s => [String(s._id), s.n]),
      );
      const [subjects, exams] = await Promise.all([
        db.collection<Named>('subjects').find({ userId }).toArray(),
        db.collection<Named>('exams').find({ userId }).toArray(),
      ]);
      return {
        topics: t?.topics ?? 0,
        activeTopics: t?.activeTopics ?? 0,
        completedTopics: t?.completedTopics ?? 0,
        revisionsDone: t?.revisionsDone ?? 0,
        revisionsPending: t?.revisionsPending ?? 0,
        overdue: t?.overdue ?? 0,
        dueToday: t?.dueToday ?? 0,
        bySubject: subjects
          .map(s => ({
            subjectId: s._id.toHexString(),
            name: s.name,
            topicCount: subjectCounts.get(String(s._id)) ?? 0,
          }))
          .sort(byName),
        byExam: exams
          .map(e => ({
            examId: e._id.toHexString(),
            name: e.name,
            topicCount: examCounts.get(String(e._id)) ?? 0,
          }))
          .sort(byName),
      };
    },
  };
}
