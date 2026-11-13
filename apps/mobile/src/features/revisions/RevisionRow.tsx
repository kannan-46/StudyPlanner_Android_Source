import React, { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { addDays, localToday, type RevisionView } from '@planner/shared';
import { ApiError, userMessage } from '../../shared/api/errors';
import { invalidateTopicData } from '../../shared/api/invalidate';
import { formatDate } from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import {
  useCompleteRevision,
  useSnoozeRevision,
  useUndoRevision,
} from './hooks';

export type RevisionRowProps = {
  topicId: string;
  topicName?: string;
  revision: RevisionView;
  isNextPending: boolean;
  isLastDone: boolean;
  total: number;
  /** Makes the topic name a link (Schedule and Home). */
  onOpenTopic?: () => void;
};

export function RevisionRow({
  topicId,
  topicName,
  revision,
  isNextPending,
  isLastDone,
  total,
  onOpenTopic,
}: RevisionRowProps) {
  const { colors, spacing } = useTheme();
  const snackbar = useSnackbar();
  const qc = useQueryClient();
  const complete = useCompleteRevision();
  const undo = useUndoRevision();
  const snooze = useSnoozeRevision();

  const done = revision.doneOn !== null;
  const due = revision.dueOverride ?? revision.dueOn;
  const date = done
    ? `✓ ${formatDate(revision.doneOn as string)}`
    : formatDate(due);

  const fail = (e: unknown) => {
    snackbar.show({ message: userMessage(e) });
    if (
      e instanceof ApiError &&
      (e.code === 'VERSION_CONFLICT' || e.code === 'REVISION_OUT_OF_ORDER')
    ) {
      invalidateTopicData(qc, topicId);
    }
  };

  const runUndo = async () => {
    try {
      await undo.mutateAsync({ topicId, revisionId: revision.id });
    } catch (e) {
      fail(e);
    }
  };

  const onDone = async () => {
    try {
      await complete.mutateAsync({
        topicId,
        revisionId: revision.id,
        doneOn: localToday(),
      });
      snackbar.show({
        message: `Revision ${revision.step} done`,
        actionLabel: 'Undo',
        onAction: runUndo,
      });
    } catch (e) {
      fail(e);
    }
  };

  const onSnooze = async () => {
    const today = localToday();
    try {
      await snooze.mutateAsync({
        topicId,
        revisionId: revision.id,
        today,
        days: 1,
      });
      snackbar.show({ message: `Snoozed to ${formatDate(addDays(today, 1))}` });
    } catch (e) {
      fail(e);
    }
  };

  return (
    <View
      style={{
        minHeight: 48,
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
        paddingVertical: spacing.xs,
      }}
    >
      <View style={{ flexShrink: 1, minWidth: 120 }}>
        {topicName ? (
          onOpenTopic ? (
            <Pressable
              accessibilityRole="link"
              onPress={onOpenTopic}
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text
                style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}
              >
                {topicName}
              </Text>
            </Pressable>
          ) : (
            <Text style={{ color: colors.text, fontWeight: '700' }}>
              {topicName}
            </Text>
          )
        ) : null}
        <Text style={{ color: done ? colors.success : colors.muted }}>
          R{revision.step}/{total} · {date}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {isNextPending ? (
          <>
            <Button
              title="Done"
              onPress={onDone}
              loading={complete.isPending}
              disabled={snooze.isPending}
            />
            <Button
              title="Snooze 1 day"
              variant="secondary"
              onPress={onSnooze}
              loading={snooze.isPending}
              disabled={complete.isPending}
            />
          </>
        ) : null}
        {isLastDone ? (
          <Button
            title="Undo"
            variant="secondary"
            onPress={runUndo}
            loading={undo.isPending}
          />
        ) : null}
      </View>
    </View>
  );
}

/** Builds TopicDetail's renderRevision from a topic's full revision list. */
export function renderRevisionRow(topicId: string, topicName?: string) {
  return (r: RevisionView, all: RevisionView[]): ReactNode => {
    const firstPending = all.find(x => x.doneOn === null);
    const done = all.filter(x => x.doneOn !== null);
    const lastDone = done.reduce<RevisionView | null>(
      (m, x) => (m === null || x.step > m.step ? x : m),
      null,
    );
    return (
      <RevisionRow
        topicId={topicId}
        topicName={topicName}
        revision={r}
        isNextPending={firstPending?.id === r.id}
        isLastDone={lastDone?.id === r.id}
        total={all.length}
      />
    );
  };
}
