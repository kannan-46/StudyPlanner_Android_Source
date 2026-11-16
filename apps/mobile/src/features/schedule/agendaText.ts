import type { AgendaItem, LocalDate, TopicView } from '@planner/shared';
import { formatDate } from '../../shared/lib/format';

/** How many days ahead Home and Schedule list revisions. */
export const AGENDA_DAYS = 30;

export type NextRevision = {
  topicName: string;
  step: number;
  dueOn: LocalDate;
};

/**
 * The soonest revision after today: from the agenda's upcoming rows, else
 * from the active topics (a revision further away than the agenda's range).
 */
export function nextRevision(
  upcoming: AgendaItem[],
  topics: TopicView[],
  today: LocalDate,
): NextRevision | null {
  const first = upcoming[0];
  if (first) {
    return { topicName: first.topicName, step: first.step, dueOn: first.dueOn };
  }
  let best: NextRevision | null = null;
  for (const t of topics) {
    if (t.status !== 'active') continue;
    if (!t.nextDueOn || t.nextDueOn <= today) continue;
    if (best && best.dueOn <= t.nextDueOn) continue;
    const pending = t.revisions
      .filter(r => r.doneOn === null)
      .sort((a, b) => a.step - b.step)[0];
    best = { topicName: t.name, step: pending?.step ?? 1, dueOn: t.nextDueOn };
  }
  return best;
}

/** "Hernia's first revision is on 20 Nov." / "Next up: Hernia, revision 2, on 20 Nov." */
export function nextRevisionText(next: NextRevision, today: LocalDate): string {
  const date = formatDate(next.dueOn, today);
  return next.step === 1
    ? `${next.topicName}'s first revision is on ${date}.`
    : `Next up: ${next.topicName}, revision ${next.step}, on ${date}.`;
}

/** "Next: Hernia on 20 Dec." for a revision beyond the agenda's range. */
export function laterRevisionText(
  next: NextRevision,
  today: LocalDate,
): string {
  return `Next: ${next.topicName} on ${formatDate(next.dueOn, today)}.`;
}

/** Empty-state wording shared by Home and Schedule. */
export const EMPTY_TEXT = {
  noTopics: {
    title: 'No topics yet',
    body: "Add a topic you've studied and we'll plan when to revise it.",
    action: 'Add your first topic',
  },
  allRevised: {
    title: 'Every topic fully revised',
    body: 'Well done! Add a new topic to keep going.',
    action: 'Add a topic',
  },
  nothingComingUp: `Nothing coming up in the next ${AGENDA_DAYS} days`,
  nothingDue: `Nothing due in the next ${AGENDA_DAYS} days`,
  upcomingSection: `Upcoming (next ${AGENDA_DAYS} days)`,
} as const;
