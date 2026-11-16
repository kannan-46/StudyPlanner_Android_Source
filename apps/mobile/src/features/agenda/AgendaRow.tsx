import React from 'react';
import type { AgendaItem, LocalDate } from '@planner/shared';
import { RevisionRow } from '../revisions/RevisionRow';

/**
 * An agenda entry is always the topic's next pending revision. Only overdue
 * and today's rows offer Done and Snooze; a revision that is not due yet is
 * just shown (finishing it early stays possible from the topic's page).
 */
export function AgendaRow({
  item,
  onOpenTopic,
  today,
}: {
  item: AgendaItem;
  onOpenTopic: (topicId: string) => void;
  today?: LocalDate;
}) {
  return (
    <RevisionRow
      topicId={item.topicId}
      topicName={item.topicName}
      revision={{
        id: item.revisionId,
        step: item.step,
        dueOn: item.dueOn,
        doneOn: null,
        dueOverride: null,
      }}
      isNextPending={item.bucket !== 'upcoming'}
      isLastDone={false}
      total={item.totalSteps}
      onOpenTopic={() => onOpenTopic(item.topicId)}
      today={today}
      agendaItem={item}
    />
  );
}
