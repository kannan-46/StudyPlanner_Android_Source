import React, { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  daysBetween,
  localToday,
  type AgendaItem,
  maxDate,
  type LocalDate,
  type RevisionView,
  type TopicView,
} from '@planner/shared';
import {
  ApiError,
  canRetry,
  isSessionEndedError,
  userMessage,
} from '../../shared/api/errors';
import { invalidateTopicData } from '../../shared/api/invalidate';
import { queryKeys } from '../../shared/api/queryClient';
import {
  dayLabel,
  doneLabel,
  dueStatus,
  formatDate,
  onDayLabel,
  snoozedLabel,
} from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import {
  useCompleteRevision,
  useSnoozeRevision,
  useUndoRevision,
  useUnsnoozeRevision,
} from './hooks';

export type RevisionRowProps = {
  topicId: string;
  /** Shown above the status (Home, Schedule); Topic detail leaves it out. */
  topicName?: string;
  /** Shown under the topic name, so topics with the same name differ. */
  subjectName?: string;
  revision: RevisionView;
  isNextPending: boolean;
  isLastDone: boolean;
  total: number;
  /** Makes the name and status one link to the topic (Schedule and Home). */
  onOpenTopic?: () => void;
  /** The local date the row's status is worded against; defaults to now. */
  today?: LocalDate;
  /** The agenda entry this row shows (Home, Schedule); Undo restores it. */
  agendaItem?: AgendaItem;
  /**
   * A later revision that can't be done yet: its estimated date, worded as
   * "Planned around 19 Nov" in muted text instead of a due status.
   */
  plannedOn?: LocalDate;
  /** A line above the row, to separate it from the row before. */
  divider?: boolean;
};

/**
 * How long a snackbar stays while its change is still being saved: longer
 * than the API's 10 s limit, so it never hides and comes back when a slow
 * save lands. The normal 5 s starts once the save is answered.
 */
export const PENDING_SNACKBAR_MS = 12_000;

const MAX_NAME_CHARS = 30;

/** A topic name short enough for a snackbar ("Very long name of a t…"). */
export function shortTopicName(name?: string | null): string | undefined {
  const n = name?.trim();
  if (!n) return undefined;
  return n.length > MAX_NAME_CHARS
    ? `${n.slice(0, MAX_NAME_CHARS - 1).trimEnd()}…`
    : n;
}

/** "Hernia · revision 2 done", or "Revision 2 done" without a name. */
export function revisionMessage(
  name: string | undefined,
  step: number,
  what: string,
): string {
  return name
    ? `${name} · revision ${step} ${what}`
    : `Revision ${step} ${what}`;
}

/** "Hernia · revision 1 done · next on 19 Nov", once the server saved it. */
function doneMessage(
  name: string | undefined,
  step: number,
  saved: unknown,
  today: LocalDate,
): string {
  const base = revisionMessage(name, step, 'done');
  const t = saved as TopicView | undefined;
  if (!t || !Array.isArray(t.revisions)) return base;
  if (t.status === 'completed' || t.nextDueOn === null) {
    return `${base} · all revisions done`;
  }
  if (typeof t.nextDueOn !== 'string') return base;
  return `${base} · next ${onDayLabel(t.nextDueOn, today)}`;
}

/** "Hernia · revision 2 snoozed to tomorrow", or "Snoozed to tomorrow". */
function snoozeMessage(
  name: string | undefined,
  step: number,
  to: LocalDate,
  today: LocalDate,
): string {
  return name
    ? revisionMessage(name, step, `snoozed to ${dayLabel(to, today)}`)
    : snoozedLabel(to, today);
}

const isTopic = (x: unknown): x is TopicView =>
  !!x && Array.isArray((x as TopicView).revisions);

export function RevisionRow({
  topicId,
  topicName,
  subjectName,
  revision,
  isNextPending,
  isLastDone,
  total,
  onOpenTopic,
  today: todayProp,
  agendaItem,
  plannedOn,
  divider,
}: RevisionRowProps) {
  const { colors, spacing } = useTheme();
  const snackbar = useSnackbar();
  const qc = useQueryClient();
  const complete = useCompleteRevision(topicId);
  const undo = useUndoRevision(topicId);
  const snooze = useSnoozeRevision(topicId);
  const unsnooze = useUnsnoozeRevision(topicId);
  const [confirmingUndo, setConfirmingUndo] = useState(false);

  const today = todayProp ?? localToday();
  const done = revision.doneOn !== null;
  const due = revision.dueOverride ?? revision.dueOn;
  const status = done
    ? { text: doneLabel(revision.doneOn as string, today), overdue: false }
    : plannedOn
    ? { text: `Planned around ${formatDate(plannedOn, today)}`, overdue: false }
    : dueStatus(due, today);
  const step = revision.step;
  const vars = { topicId, revisionId: revision.id };
  const statusLine = `Revision ${step} of ${total} · ${status.text}`;
  const whose = topicName
    ? `${topicName} revision ${step}`
    : `revision ${step}`;

  /** The topic's name for snackbars (Topic detail rows show no name). */
  const nameForMessages = () =>
    shortTopicName(
      topicName ?? qc.getQueryData<TopicView>(queryKeys.topic(topicId))?.name,
    );

  const fail = (e: unknown, retry?: () => void) => {
    // Signed out meanwhile: the sign-in screen shows, say nothing.
    if (isSessionEndedError(e)) return;
    const conflict =
      e instanceof ApiError &&
      (e.code === 'VERSION_CONFLICT' || e.code === 'REVISION_OUT_OF_ORDER');
    const message = userMessage(e, 'topic');
    snackbar.show(
      retry && !conflict && canRetry(e)
        ? { message, actionLabel: 'Retry', onAction: retry }
        : { message },
    );
    if (conflict) invalidateTopicData(qc, topicId);
  };

  /**
   * Takes down a snackbar shown while saving, when the save ended with the
   * sign-out (the sign-in screen shows; nothing should be left over).
   */
  const dropPending = (id: number, message: string) => {
    // Uses the snackbar's own dismiss(id) as soon as shared/ui offers one;
    // until then a 1 ms update takes it down.
    const { dismiss } = snackbar as typeof snackbar & {
      dismiss?: (snackbarId: number) => void;
    };
    if (typeof dismiss === 'function') dismiss(id);
    else snackbar.update(id, { message, durationMs: 1 });
  };

  /** Marks the revision done again on the day it was first done. */
  const redo = async (doneOn: LocalDate) => {
    const name = nameForMessages();
    try {
      await complete.mutateAsync({ ...vars, doneOn });
      snackbar.show({
        message: revisionMessage(
          name,
          step,
          `done again (${formatDate(doneOn, localToday())})`,
        ),
      });
    } catch (e) {
      fail(e, () => {
        redo(doneOn);
      });
    }
  };

  /**
   * `afterDone`: the Done being taken back, if it may not be saved yet.
   * `redoOn`: the day an earlier Done was made; the snackbar offers Redo,
   * which puts that date back.
   */
  const runUndo = async (
    opts: { afterDone?: Promise<unknown>; redoOn?: LocalDate } = {},
  ) => {
    const name = nameForMessages();
    try {
      await undo.mutateAsync({
        ...vars,
        restore: agendaItem,
        afterDone: opts.afterDone,
      });
      const message = revisionMessage(name, step, 'restored');
      const redoOn = opts.redoOn;
      snackbar.show(
        redoOn
          ? {
              message,
              actionLabel: 'Redo',
              onAction: () => {
                redo(redoOn);
              },
            }
          : { message },
      );
    } catch (e) {
      fail(e);
    }
  };

  // Undoing a Done from an earlier day loses that day, so it asks first.
  const onRowUndo = () => {
    const doneOn = revision.doneOn;
    if (doneOn === null || doneOn === today) {
      runUndo();
    } else {
      setConfirmingUndo(true);
    }
  };

  // Optimistic: the row updates and the snackbar, with Undo, shows at once.
  // An Undo tapped before the Done is saved waits for it (same topic scope)
  // and sends nothing if the Done fails. Once saved, the snackbar names the
  // next revision's date.
  const onDone = async () => {
    const now = localToday();
    const name = nameForMessages();
    let undone = false;
    const saving = complete.mutateAsync({ ...vars, doneOn: now });
    const undoThis = () => {
      undone = true;
      runUndo({ afterDone: saving });
    };
    const action = { actionLabel: 'Undo', onAction: undoThis };
    const pendingMessage = revisionMessage(name, step, 'done');
    const id = snackbar.show({
      message: pendingMessage,
      ...action,
      durationMs: PENDING_SNACKBAR_MS,
    });
    try {
      const saved = await saving;
      if (!undone) {
        snackbar.update(id, {
          message: doneMessage(name, step, saved, now),
          ...action,
        });
      }
    } catch (e) {
      // Already taken back: the Undo reports the outcome.
      if (undone) return;
      if (isSessionEndedError(e)) dropPending(id, pendingMessage);
      else fail(e, onDone);
    }
  };

  /**
   * Puts a snoozed revision back on `dueOn`, the date it showed before.
   * `afterSnooze`: the snooze being taken back, if it may not be saved yet.
   */
  const runUnsnooze = async (
    dueOn: LocalDate,
    restore: AgendaItem | undefined,
    afterSnooze?: Promise<unknown>,
  ) => {
    const name = nameForMessages();
    try {
      await unsnooze.mutateAsync({ ...vars, dueOn, restore, afterSnooze });
      snackbar.show({ message: revisionMessage(name, step, 'snooze undone') });
    } catch (e) {
      fail(e, () => {
        runUnsnooze(dueOn, restore);
      });
    }
  };

  // Optimistic too: the row moves to its new date at once, so it can't be
  // snoozed twice by mistake. A failure puts it back and offers Retry. The
  // snackbar offers Undo, which puts the row back on the date it showed; an
  // Undo tapped before the snooze is saved waits for it (same topic scope)
  // and sends nothing if the snooze fails.
  const onSnooze = async () => {
    const now = localToday();
    const name = nameForMessages();
    const prevDue = due;
    const prevRow = agendaItem;
    const expected = addDays(maxDate(now, due), 1);
    let undone = false;
    const saving = snooze.mutateAsync({ ...vars, today: now, days: 1 });
    const action = {
      actionLabel: 'Undo',
      onAction: () => {
        undone = true;
        runUnsnooze(prevDue, prevRow, saving);
      },
    };
    const pendingMessage = snoozeMessage(name, step, expected, now);
    const id = snackbar.show({
      message: pendingMessage,
      ...action,
      durationMs: PENDING_SNACKBAR_MS,
    });
    try {
      const res = await saving;
      if (undone) return;
      const saved = isTopic(res)
        ? res.revisions.find(r => r.id === revision.id)
        : undefined;
      const to = saved?.dueOverride ?? saved?.dueOn ?? expected;
      snackbar.update(id, {
        message: snoozeMessage(name, step, to, now),
        ...action,
      });
    } catch (e) {
      // Already taken back: the Undo reports the outcome.
      if (undone) return;
      if (isSessionEndedError(e)) dropPending(id, pendingMessage);
      else fail(e, onSnooze);
    }
  };

  const statusText = (
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
      {statusLine}
    </Text>
  );
  const subjectText = subjectName ? (
    <Text style={{ color: colors.muted }}>{subjectName}</Text>
  ) : null;
  const link = !!(topicName && onOpenTopic);

  const info = link ? (
    <Pressable
      testID="revision-row-link"
      accessibilityRole="link"
      accessibilityLabel={[topicName, subjectName, statusLine]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint="Opens the topic"
      onPress={onOpenTopic}
      android_ripple={{ color: colors.line }}
      style={{
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 120,
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
      }}
    >
      <View style={{ flexGrow: 1, flexShrink: 1 }}>
        <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 16 }}>
          {topicName}
        </Text>
        {subjectText}
        {statusText}
      </View>
      <Text
        testID="revision-row-chevron"
        importantForAccessibility="no"
        maxFontSizeMultiplier={1.5}
        style={{ color: colors.muted, fontSize: 22 }}
      >
        ›
      </Text>
    </Pressable>
  ) : (
    <View style={{ flexShrink: 1, minWidth: 120 }}>
      {topicName ? (
        <Text style={{ color: colors.text, fontWeight: '700' }}>
          {topicName}
        </Text>
      ) : null}
      {subjectText}
      {statusText}
    </View>
  );

  return (
    <View
      testID="revision-row"
      style={[
        {
          minHeight: 48,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
          paddingVertical: spacing.xs,
        },
        divider && {
          borderTopWidth: 1,
          borderTopColor: colors.line,
          marginTop: spacing.xs,
          paddingTop: spacing.sm,
        },
      ]}
    >
      {info}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {isNextPending ? (
          <>
            <Button
              title="Done"
              accessibilityLabel={`Done, ${whose}`}
              onPress={() => {
                // Not awaited: the press returns at once, the result shows in
                // the snackbar.
                onDone();
              }}
              loading={complete.isPending}
              disabled={
                snooze.isPending || undo.isPending || unsnooze.isPending
              }
            />
            <Button
              title="Snooze 1 day"
              accessibilityLabel={`Snooze 1 day, ${whose}`}
              variant="secondary"
              onPress={() => {
                onSnooze();
              }}
              loading={snooze.isPending || unsnooze.isPending}
              disabled={complete.isPending || undo.isPending}
            />
          </>
        ) : null}
        {isLastDone ? (
          <Button
            title="Undo"
            accessibilityLabel={`Undo, ${whose}`}
            variant="secondary"
            onPress={onRowUndo}
            loading={undo.isPending}
            disabled={
              complete.isPending || snooze.isPending || unsnooze.isPending
            }
          />
        ) : null}
      </View>
      {confirmingUndo && revision.doneOn !== null ? (
        <ConfirmDialog
          visible
          title={`Mark revision ${step} as not done?`}
          message={`You marked it done on ${formatDate(
            revision.doneOn,
            today,
          )}. If you change your mind, tap Redo straight after to put that date back.`}
          confirmLabel="Mark not done"
          onConfirm={() => {
            const redoOn = revision.doneOn ?? undefined;
            setConfirmingUndo(false);
            runUndo({ redoOn });
          }}
          onCancel={() => setConfirmingUndo(false)}
        />
      ) : null}
    </View>
  );
}

/**
 * Estimated dates of the revisions after the next pending one, keyed by
 * revision id. Revisions follow each other, so these are counted from the day
 * the next one can be done (today, or its due date if later), the same way
 * the schedule moves when Done is tapped then. Stored dates of later
 * revisions can be in the past when the next one is overdue; these never are.
 */
export function plannedDates(
  all: RevisionView[],
  today: LocalDate = localToday(),
): Map<string, LocalDate> {
  const planned = new Map<string, LocalDate>();
  const sorted = [...all].sort((a, b) => a.step - b.step);
  const first = sorted.find(r => r.doneOn === null);
  if (!first) return planned;
  const firstDue = first.dueOverride ?? first.dueOn;
  let base = maxDate(today, firstDue);
  let prevStored = firstDue;
  for (const r of sorted) {
    if (r.step <= first.step || r.doneOn !== null) continue;
    const stored = r.dueOverride ?? r.dueOn;
    const gap = Math.max(1, daysBetween(prevStored, r.dueOn));
    const date = r.dueOverride ?? addDays(base, gap);
    planned.set(r.id, date);
    base = date;
    prevStored = stored;
  }
  return planned;
}

/**
 * Builds TopicDetail's renderRevision from a topic's full revision list.
 * `topicName` shows the name on every row (Topic detail leaves it out; the
 * snackbars still name the topic). `today` words the dates.
 */
export function renderRevisionRow(
  topicId: string,
  topicName?: string,
  today?: LocalDate,
) {
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
    const firstStep = Math.min(...all.map(x => x.step));
    const plannedOn =
      r.doneOn === null && firstPending && r.step > firstPending.step
        ? plannedDates(all, today ?? localToday()).get(r.id)
        : undefined;
    return (
      <RevisionRow
        topicId={topicId}
        topicName={topicName}
        revision={r}
        isNextPending={firstPending?.id === r.id}
        isLastDone={lastDone?.id === r.id}
        total={all.length}
        today={today}
        plannedOn={plannedOn}
        divider={r.step > firstStep}
      />
    );
  };
}
