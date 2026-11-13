import React from 'react';
import type { AgendaItem } from '@planner/shared';
import { RevisionRow } from '../revisions/RevisionRow';

/** An agenda entry is always the topic's next pending revision. */
export function AgendaRow({
  item,
  onOpenTopic,
}: {
  item: AgendaItem;
  onOpenTopic: (topicId: string) => void;
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
      isNextPending
      isLastDone={false}
      total={item.totalSteps}
      onOpenTopic={() => onOpenTopic(item.topicId)}
    />
  );
}
