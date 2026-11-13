import type { ObjectId } from 'mongodb';
import { addDays, compareDates, type AgendaItem } from '@planner/shared';
import type { AppDeps } from '../../core/deps';
import type { TopicDoc } from '../topics/topic.mapper';

export function createAgendaService(deps: AppDeps) {
  return {
    async list(
      userId: ObjectId,
      today: string,
      days: number,
    ): Promise<AgendaItem[]> {
      const db = await deps.getDb();
      const topics = await db
        .collection<TopicDoc>('topics')
        .find({
          userId,
          status: 'active',
          nextDueOn: { $lte: addDays(today, days) },
        })
        .sort({ nextDueOn: 1, name: 1, _id: 1 })
        .toArray();
      if (topics.length === 0) return [];
      const subjects = await db
        .collection<{ _id: ObjectId; name: string }>('subjects')
        .find({ userId })
        .toArray();
      const names = new Map(subjects.map(s => [String(s._id), s.name]));
      const items: AgendaItem[] = [];
      for (const t of topics) {
        const rev = t.revisions.find(r => r.doneOn === null);
        if (!rev) continue;
        const c = compareDates(rev.dueOn, today);
        items.push({
          topicId: t._id.toHexString(),
          topicName: t.name,
          subjectId: t.subjectId.toHexString(),
          subjectName: names.get(String(t.subjectId)) ?? '',
          revisionId: rev.id,
          step: rev.step,
          totalSteps: t.intervals.length,
          dueOn: rev.dueOn,
          bucket: c < 0 ? 'overdue' : c === 0 ? 'today' : 'upcoming',
        });
      }
      return items;
    },
  };
}
