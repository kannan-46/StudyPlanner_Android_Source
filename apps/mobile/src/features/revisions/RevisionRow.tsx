import React, { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  localToday,
  maxDate,
  type LocalDate,
  type RevisionView,
  type TopicView,
} from '@planner/shared';
import { ApiError, userMessage } from '../../shared/api/errors';
import { invalidateTopicData } from '../../shared/api/invalidate';
import { dueStatus, formatDate } from '../../shared/lib/format';
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
  /** The local date the row's status is worded against; defaults to now. */
  today?: LocalDate;
};

/** Errors worth trying again: no connection or a server-side failure. */
function canRetry(e: unknown): boolean {
  return !(e instanceof ApiError) || e.code === 'NETWORK' || e.status >= 500;
}

export function RevisionRow({
  topicId,
  topicName,
  revision,
  isNextPending,
  isLastDone,
  total,
  onOpenTopic,
  today: todayProp,
}: RevisionRowProps) {
  const { colors, spacing } = useTheme();
  const snackbar = useSnackbar();
  const qc = useQueryClient();
  const complete = useCompleteRevision(topicId);
  const undo = useUndoRevision(topicId);
  const snooze = useSnoozeRevision(topicId);

  const today = todayProp ?? localToday();
  const done = revision.doneOn !== null;
  const due = revision.dueOverride ?? revision.dueOn;
  const status = done
    ? {
        text: `Done ${formatDate(revision.doneOn as string, today)}`,
        overdue: false,
      }
    : dueStatus(due, today);
  const step = revision.step;
  const vars = { topicId, revisionId: revision.id };

  const fail = (e: unknown, retry?: () => void) => {
    const conflict =
      e instanceof ApiError &&
      (e.code === 'VERSION_CONFLICT' || e.code === 'REVISION_OUT_OF_ORDER');
    snackbar.show(
      retry && !conflict && canRetry(e)
        ? { message: userMessage(e), actionLabel: 'Retry', onAction: retry }
        : { message: userMessage(e) },
    );
    if (conflict) invalidateTopicData(qc, topicId).catch(() => {});
  };

  const runUndo = async () => {
    try {
      await undo.mutateAsync(vars);
      snackbar.show({ message: `Revision ${step} restored` });
    } catch (e) {
      fail(e);
    }
  };

  // Optimistic: the row updates and the snackbar shows at once. Its Undo
  // appears only once the server has saved the Done, so it can't race it.
  const onDone = async () => {
    const message = `Revision ${step} done`;
    const id = snackbar.show({ message });
    try {
      await complete.mutateAsync({ ...vars, doneOn: localToday() });
      snackbar.update(id, { message, actionLabel: 'Undo', onAction: runUndo });
    } catch (e) {
      fail(e, onDone);
    }
  };

  const onSnooze = async () => {
    const now = localToday();
    try {
      const res: TopicView | undefined = await snooze.mutateAsync({
        ...vars,
        today: now,
        days: 1,
      });
      const saved = res?.revisions?.find(r => r.id === revision.id);
      const to =
        saved?.dueOverride ?? saved?.dueOn ?? addDays(maxDate(now, due), 1);
      snackbar.show({ message: `Snoozed to ${formatDate(to, now)}` });
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
        <Text
          style={{
            color: done
              ? colors.success
              : status.overdue
              ? colors.danger
              : colors.muted,
            fontWeight: status.overdue ? '700' : undefined,
          }}
        >
          {`Revision ${step} of ${total} · ${status.text}`}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {isNextPending ? (
          <>
            <Button
              title="Done"
              onPress={() => {
                // Not awaited: the press returns at once, the result shows in
                // the snackbar.
                onDone();
              }}
              loading={complete.isPending}
              disabled={snooze.isPending || undo.isPending}
            />
            <Button
              title="Snooze 1 day"
              variant="secondary"
              onPress={onSnooze}
              loading={snooze.isPending}
              disabled={complete.isPending || undo.isPending}
            />
          </>
        ) : null}
        {isLastDone ? (
          <Button
            title="Undo"
            variant="secondary"
            onPress={runUndo}
            loading={undo.isPending}
            disabled={complete.isPending || snooze.isPending}
          />
        ) : null}
      </View>
    </View>
  );
}

/** Builds TopicDetail's renderRevision from a topic's full revision list. */
export function renderRevisionRow(topicId: string, topicName?: string) {
  return (r: RevisionView, all: RevisionView[]): ReactNode => {
    const firstPending = all
      .filter(x => x.doneOn === null)
      .reduce<RevisionView | null>(
        (m, x) => (m === null || x.step < m.step ? x : m),
        null,
      );
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
