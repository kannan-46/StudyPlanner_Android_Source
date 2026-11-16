import React, {
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type HostInstance,
  type TextInputInstance,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  examInputSchema,
  localToday,
  nameKey,
  subjectInputSchema,
  topicCreateSchema,
  topicUpdateSchema,
  type ExamView,
  type LocalDate,
  type SubjectView,
  type TopicCreateInput,
  type TopicUpdateInput,
  type TopicView,
} from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import {
  ApiError,
  isSessionEndedError,
  userMessage,
} from '../../shared/api/errors';
import { queryKeys } from '../../shared/api/queryClient';
import { formatDate } from '../../shared/lib/format';
import { useLocalToday } from '../../shared/lib/useLocalToday';
import { announce } from '../../shared/ui/announce';
import { Button, type ButtonVariant } from '../../shared/ui/Button';
import { ChipSelect } from '../../shared/ui/ChipSelect';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { DateField } from '../../shared/ui/DateField';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { ScreenScrollContext } from '../../shared/ui/Screen';
import { TextField } from '../../shared/ui/TextField';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useCreateExam, useExams } from '../exams/hooks';
import { useCreateSubject, useSubjects } from '../subjects/hooks';
import { useCreateTopic, useUpdateTopic } from './hooks';

const NEW_SUBJECT = '__new__';
/** Stands in for the not-yet-created subject while validating. */
const PLACEHOLDER_ID = '0'.repeat(24);
/** More subjects than this: one sideways-scrolling row instead of a wall. */
const SUBJECT_SCROLL_AFTER = 8;

type Field =
  | 'name'
  | 'subject'
  | 'newSubject'
  | 'studiedOn'
  | 'intervals'
  | 'form';
type Errors = Partial<Record<Field, string>>;
/** Top-to-bottom, so the first one with an error is scrolled to. */
const FIELD_ORDER: Field[] = [
  'name',
  'subject',
  'newSubject',
  'studiedOn',
  'intervals',
  'form',
];
/** How each field is named in messages ("Please check: Topic name"). */
const FIELD_LABEL: Record<Field, string> = {
  name: 'Topic name',
  subject: 'Subject',
  newSubject: 'New subject name',
  studiedOn: 'Studied on',
  intervals: 'Custom revision days',
  form: '',
};

export const MSG = {
  name: 'Enter a topic name',
  subject: 'Choose a subject',
  newSubject: 'Enter a name for the new subject',
  intervals: 'Use numbers that increase, like 4, 7, 15',
  intervalRange: 'Each interval must be between 1 and 999 days',
  intervalCount: 'Use 20 intervals or fewer',
  studiedAfterDone: "This date can't be after a revision you've already done",
  form: 'Something here needs fixing — check the form and try again',
  goneExam:
    'One of the chosen exams no longer exists — check the exams and save again',
  examName: 'Enter a name for the exam',
};

/** Shortened intervals must still cover the revisions already done. */
export function tooFewIntervalsMessage(done: number): string {
  return done === 1
    ? "You've already done 1 revision — keep at least 1 interval"
    : `You've already done ${done} revisions — keep at least ${done} intervals`;
}

/** The fields that need fixing, by name: "Please check: Topic name, Subject". */
export function fieldSummary(labels: string[]): string {
  return `Please check: ${labels.join(', ')}`;
}

/**
 * Exams ticked when a new topic's form opens: every exam for 'all', the
 * wanted ones that still exist, else the only exam when there is just one.
 * Null while the exams are not loaded.
 */
export function defaultExamSelection(
  exams: ExamView[] | undefined,
  wanted?: 'all' | string[],
): string[] | null {
  if (!exams) return null;
  const ids = exams.map(e => e.id);
  if (wanted === 'all') return ids;
  const picked = (wanted ?? []).filter(id => ids.includes(id));
  if (picked.length > 0) return picked;
  return ids.length === 1 ? ids : [];
}

/** Lets a parent screen save the form from its own button (onboarding). */
export type TopicFormHandle = {
  /** Validates and saves; the saved topic, or null when it did not save. */
  submit: () => Promise<TopicView | null>;
  /** Whether the form holds something worth saving (a typed topic name). */
  hasDraft: () => boolean;
};

export type TopicFormProps = {
  ref?: React.Ref<TopicFormHandle>;
  mode: 'create' | 'edit';
  initial?: TopicView;
  /** Compact (onboarding): name, subject, exams and date only. */
  compact?: boolean;
  /** Clear only the name after a successful create (keep subject/exams/date). */
  clearNameOnSave?: boolean;
  /** Overrides the submit button label. */
  submitLabel?: string;
  submitVariant?: ButtonVariant;
  onSaved: (topic: TopicView) => void;
  /** Told whether the form now differs from how it opened. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Told whether the form holds a draft worth saving (see hasDraft). */
  onDraftChange?: (hasDraft: boolean) => void;
  /** Told when a save starts and ends (for the screen's leave guard). */
  onSavingChange?: (saving: boolean) => void;
  /**
   * Create mode: exams ticked when the form opens. 'all' ticks every exam
   * (setup, right after choosing them); ids tick those that still exist (the
   * Topics exam filter). Without it, the only exam is ticked when there is
   * exactly one.
   */
  defaultExamIds?: 'all' | string[];
};

/**
 * Intervals typed as text. Commas, spaces, dots, dashes or slashes separate
 * the numbers, since Android number keyboards often lack a comma.
 */
function parseIntervals(text: string): number[] | undefined | string {
  const parts = text.split(/[\s,.;/-]+/).filter(Boolean);
  if (parts.length === 0) return undefined;
  const nums = parts.map(Number);
  if (nums.some(n => !Number.isInteger(n))) return MSG.intervals;
  if (nums.some(n => n < 1 || n > 999)) return MSG.intervalRange;
  if (nums.length > 20) return MSG.intervalCount;
  if (nums.some((n, i) => i > 0 && n <= (nums[i - 1] ?? 0))) {
    return MSG.intervals;
  }
  return nums;
}

/**
 * Turns the API's VALIDATION_FAILED details into messages under fields.
 * `sentIntervals` (edit mode): the save changed the intervals, so a reply
 * with no details at all means they no longer cover the revisions already
 * done (the server sends no details for that).
 */
function serverFieldErrors(
  e: unknown,
  ctx: { doneCount: number; sentIntervals: boolean },
): Errors | null {
  if (!(e instanceof ApiError) || e.code !== 'VALIDATION_FAILED') return null;
  const out: Errors = {};
  const details = Array.isArray(e.details) ? e.details : [];
  for (const d of details as { path?: unknown[]; message?: unknown }[]) {
    const key = Array.isArray(d?.path) ? d.path[0] : undefined;
    if (key === 'studiedOn') out.studiedOn ??= MSG.studiedAfterDone;
    else if (key === 'name') out.name ??= 'Check the topic name';
    else if (key === 'intervals') {
      const text = typeof d.message === 'string' ? d.message : '';
      out.intervals ??=
        /completed|fewer/i.test(text) && ctx.doneCount > 0
          ? tooFewIntervalsMessage(ctx.doneCount)
          : MSG.intervals;
    } else if (key === 'subjectId') {
      out.subject ??= 'That subject no longer exists — choose another';
    } else if (key === 'examIds') {
      out.form ??= MSG.goneExam;
    }
  }
  if (Object.keys(out).length === 0) {
    if (details.length === 0 && ctx.sentIntervals && ctx.doneCount > 0) {
      out.intervals = tooFewIntervalsMessage(ctx.doneCount);
    } else {
      out.form = MSG.form;
    }
  }
  return out;
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every(x => b.includes(x));

export function TopicForm({
  ref,
  mode,
  initial,
  compact,
  clearNameOnSave,
  submitLabel,
  submitVariant,
  onSaved,
  onDirtyChange,
  onDraftChange,
  onSavingChange,
  defaultExamIds,
}: TopicFormProps) {
  const { colors, spacing } = useTheme();
  const { subjects: subjectsApi, me: meApi } = useApi();
  const qc = useQueryClient();
  const scroll = useContext(ScreenScrollContext);
  const subjectsQ = useSubjects();
  const examsQ = useExams();
  const createTopic = useCreateTopic();
  const updateTopic = useUpdateTopic();
  const createSubject = useCreateSubject();
  const createExam = useCreateExam();

  // Exams already loaded when the form opens (the usual case: Home loads
  // them) give the starting ticks at once; otherwise an effect below does.
  const cachedExams = qc.getQueryData<ExamView[]>(queryKeys.exams);
  const startingExamIds = (exams: ExamView[] | undefined): string[] | null => {
    if (mode === 'create' && !initial) {
      return defaultExamSelection(exams, defaultExamIds);
    }
    const ids = initial?.examIds ?? [];
    // An exam deleted since the topic was loaded has no chip; never keep it
    // ticked out of sight (the save would be refused).
    return exams ? ids.filter(id => exams.some(e => e.id === id)) : null;
  };

  const [name, setName] = useState(initial?.name ?? '');
  const [subjectChoice, setSubjectChoice] = useState<string>(
    initial?.subjectId ?? '',
  );
  const [newSubject, setNewSubject] = useState('');
  const [examIds, setExamIds] = useState<string[]>(
    () => startingExamIds(cachedExams) ?? initial?.examIds ?? [],
  );
  const examStartApplied = useRef(cachedExams !== undefined);
  const examsTouched = useRef(false);
  const [studiedOn, setStudiedOn] = useState<LocalDate>(
    initial?.studiedOn ?? localToday(),
  );
  const [intervalsText, setIntervalsText] = useState(
    initial?.intervals.join(', ') ?? '',
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  // Bumped after a failed save so the effect below scrolls to the first error.
  const [revealErrors, setRevealErrors] = useState(0);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  // A subject created by a failed attempt is reused on Retry.
  const createdSubject = useRef<{ key: string; id: string } | null>(null);

  // "+ New exam" dialog.
  const [examDialog, setExamDialog] = useState(false);
  const [newExamName, setNewExamName] = useState('');
  const [examDialogError, setExamDialogError] = useState<string | null>(null);

  // Where each field sits, to scroll to (and focus) the first invalid one.
  const boxes = useRef<Partial<Record<Field, HostInstance | null>>>({});
  const inputs = useRef<Partial<Record<Field, TextInputInstance | null>>>({});
  const box = (f: Field) => (v: HostInstance | null) => {
    boxes.current[f] = v;
  };
  const input = (f: Field) => (v: TextInputInstance | null) => {
    inputs.current[f] = v;
  };

  const isNew = subjectChoice === NEW_SUBJECT;
  // Edits cannot move "Studied on" past a revision that is already done.
  const earliestDone = initial?.revisions
    .map(r => r.doneOn)
    .filter((d): d is LocalDate => !!d)
    .sort()[0];
  // Edits cannot shorten the intervals below the revisions already done.
  const doneCount =
    mode === 'edit' ? initial?.revisions.filter(r => r.doneOn).length ?? 0 : 0;
  const today = useLocalToday();
  const maxStudiedOn =
    earliestDone && earliestDone < today ? earliestDone : today;

  // What the form opened with, to tell whether anything has been changed.
  // After "Add another" it is what the form kept for the next topic.
  const openedRef = useRef({
    name,
    subjectChoice,
    newSubject,
    examIds,
    studiedOn,
    intervalsText,
    notes,
  });
  const opened = openedRef.current;
  const dirty =
    name !== opened.name ||
    subjectChoice !== opened.subjectChoice ||
    newSubject !== opened.newSubject ||
    !sameSet(examIds, opened.examIds) ||
    studiedOn !== opened.studiedOn ||
    intervalsText !== opened.intervalsText ||
    notes !== opened.notes;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  const hasDraft = mode === 'create' ? name.trim() !== '' : dirty;
  useEffect(() => {
    onDraftChange?.(hasDraft);
  }, [hasDraft, onDraftChange]);
  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);

  // Exams that arrive after the form opened: tick the defaults (or drop a
  // deleted exam), unless the student has already chosen. It counts as how
  // the form opened, so it never asks "Discard changes?" on its own.
  useEffect(() => {
    if (examStartApplied.current || !examsQ.data) return;
    examStartApplied.current = true;
    if (examsTouched.current) return;
    const start = startingExamIds(examsQ.data);
    if (!start || sameSet(start, examIds)) return;
    openedRef.current = { ...openedRef.current, examIds: start };
    setExamIds(start);
    // Only when the exams first arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examsQ.data]);

  useEffect(() => {
    if (revealErrors === 0) return;
    const first = FIELD_ORDER.find(f => errors[f]);
    if (!first) return;
    scroll?.scrollToView(boxes.current[first] ?? null);
    const field = inputs.current[first];
    if (field) {
      // The field's spoken name includes its error.
      field.focus();
    } else {
      const label = FIELD_LABEL[first];
      announce(label ? `${label}: ${errors[first]}` : errors[first]);
    }
    // Only after a failed save, not while the user is fixing fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealErrors]);

  /** Editing a field clears its own error and any form-level error. */
  const clearErrors = (...fields: Field[]) => {
    setSubmitError(null);
    setErrors(e =>
      fields.some(f => e[f]) || e.form
        ? Object.fromEntries(
            Object.entries(e).filter(
              ([k]) => k !== 'form' && !fields.includes(k as Field),
            ),
          )
        : e,
    );
  };

  const fail = (next: Errors) => {
    if (next.intervals) setShowAdvanced(true);
    setErrors(next);
    setRevealErrors(n => n + 1);
  };

  // Ticked exams that are not in the loaded list (deleted since) are never
  // sent. While the list is loading or failed, keep everything.
  const knownExamIds = examsQ.data
    ? new Set(examsQ.data.map(e => e.id))
    : null;
  const keepKnown = (ids: string[]) =>
    knownExamIds ? ids.filter(id => knownExamIds.has(id)) : ids;

  /** After the server said an exam is gone: reload exams, untick it. */
  const dropGoneExams = () => {
    examsQ
      .refetch()
      .then(r => {
        if (!r.data) return;
        const ids = new Set(r.data.map(e => e.id));
        setExamIds(prev => prev.filter(id => ids.has(id)));
      })
      .catch(() => {});
  };

  async function resolveSubjectId(): Promise<string> {
    if (!isNew) return subjectChoice;
    const parsedName = subjectInputSchema.parse({ name: newSubject });
    const key = nameKey(parsedName.name);
    if (createdSubject.current?.key === key) return createdSubject.current.id;
    let id: string;
    try {
      const created = await createSubject.mutateAsync(parsedName);
      id = created.id;
      // Show its chip at once; the subjects list refreshes in the background.
      qc.setQueryData<SubjectView[]>(queryKeys.subjects, old =>
        old && created?.id && !old.some(s => s.id === created.id)
          ? [...old, created]
          : old,
      );
    } catch (e) {
      if (!(e instanceof ApiError) || e.code !== 'DUPLICATE_NAME') throw e;
      const existing = (await subjectsApi.list()).find(
        s => nameKey(s.name) === key,
      );
      if (!existing) throw e;
      id = existing.id;
    }
    createdSubject.current = { key, id };
    return id;
  }

  async function submit(): Promise<TopicView | null> {
    if (busy.current) return null;
    setSubmitError(null);
    const next: Errors = {};
    const intervals = compact ? undefined : parseIntervals(intervalsText);
    if (typeof intervals === 'string') next.intervals = intervals;
    else if (intervals && intervals.length < doneCount) {
      next.intervals = tooFewIntervalsMessage(doneCount);
    }
    if (!subjectChoice) next.subject = MSG.subject;
    if (isNew && !subjectInputSchema.safeParse({ name: newSubject }).success) {
      next.newSubject = MSG.newSubject;
    }
    if (earliestDone && studiedOn > earliestDone) {
      next.studiedOn = `${MSG.studiedAfterDone} (${formatDate(earliestDone)})`;
    }
    const draft = {
      name,
      subjectId: isNew || !subjectChoice ? PLACEHOLDER_ID : subjectChoice,
      examIds: keepKnown(examIds),
      studiedOn,
      intervals: Array.isArray(intervals) ? intervals : undefined,
      notes,
    };
    const parsed = topicCreateSchema.safeParse(draft);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'name') next.name ??= MSG.name;
        else if (key === 'intervals') next.intervals ??= MSG.intervals;
        else next.form ??= MSG.form;
      }
    }
    if (Object.keys(next).length > 0 || !parsed.success) {
      fail(next);
      return null;
    }
    setErrors({});

    busy.current = true;
    setSaving(true);
    let sentIntervals = false;
    try {
      const subjectId = await resolveSubjectId();
      if (mode === 'create') {
        const created = await createTopic.mutateAsync({
          ...parsed.data,
          subjectId,
        } satisfies TopicCreateInput);
        if (clearNameOnSave) {
          // Keep the subject just used, as its real chip (not "+ New
          // subject" with the name still typed in).
          const keptChoice = isNew ? subjectId : subjectChoice;
          const keptNew = isNew ? '' : newSubject;
          openedRef.current = {
            name: '',
            subjectChoice: keptChoice,
            newSubject: keptNew,
            examIds,
            studiedOn,
            intervalsText,
            notes,
          };
          setName('');
          setSubjectChoice(keptChoice);
          setNewSubject(keptNew);
        }
        onSaved(created);
        return created;
      }
      if (!initial) return null;
      const patch: TopicUpdateInput = {};
      if (parsed.data.name !== initial.name) patch.name = parsed.data.name;
      if (subjectId !== initial.subjectId) patch.subjectId = subjectId;
      if (!sameSet(parsed.data.examIds, keepKnown(initial.examIds))) {
        patch.examIds = parsed.data.examIds;
      }
      if (parsed.data.studiedOn !== initial.studiedOn) {
        patch.studiedOn = parsed.data.studiedOn;
      }
      let wanted = parsed.data.intervals;
      if (!wanted && !compact) {
        // Cleared field: go back to the user's default intervals.
        wanted = (await meApi.get()).settings?.intervals;
        if (!wanted) {
          fail({ intervals: 'Enter intervals like 4, 7, 15' });
          return null;
        }
        if (wanted.length < doneCount) {
          fail({ intervals: tooFewIntervalsMessage(doneCount) });
          return null;
        }
      }
      if (wanted && wanted.join(',') !== initial.intervals.join(',')) {
        patch.intervals = wanted;
        sentIntervals = true;
      }
      if (parsed.data.notes !== initial.notes) patch.notes = parsed.data.notes;
      if (Object.keys(patch).length === 0) {
        onSaved(initial);
        return initial;
      }
      const checked = topicUpdateSchema.safeParse(patch);
      if (!checked.success) {
        fail(
          checked.error.issues[0]?.path[0] === 'intervals'
            ? { intervals: MSG.intervals }
            : { form: MSG.form },
        );
        return null;
      }
      const updated = await updateTopic.mutateAsync({
        id: initial.id,
        patch: checked.data,
      });
      onSaved(updated);
      return updated;
    } catch (e) {
      // Signed out while saving: the sign-in screen is up, say nothing.
      if (isSessionEndedError(e)) return null;
      // A field the server rejected goes under that field; Retry would only
      // fail again, so it is kept for connection and server problems.
      const fieldErrors = serverFieldErrors(e, { doneCount, sentIntervals });
      if (fieldErrors) {
        if (fieldErrors.form === MSG.goneExam) dropGoneExams();
        fail(fieldErrors);
      } else setSubmitError(e);
      return null;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  useImperativeHandle(ref, () => ({ submit, hasDraft: () => hasDraft }));

  const tickExam = (id: string) => {
    examsTouched.current = true;
    setExamIds(prev => (prev.includes(id) ? prev : [...prev, id]));
    clearErrors();
  };

  const openExamDialog = () => {
    setNewExamName('');
    setExamDialogError(null);
    setExamDialog(true);
  };

  const addExam = async () => {
    const parsedExam = examInputSchema.safeParse({ name: newExamName });
    if (!parsedExam.success) {
      setExamDialogError(MSG.examName);
      return;
    }
    const key = nameKey(parsedExam.data.name);
    try {
      const created = await createExam.mutateAsync(parsedExam.data);
      qc.setQueryData<ExamView[]>(queryKeys.exams, old =>
        old && created?.id && !old.some(e => e.id === created.id)
          ? [...old, created]
          : old,
      );
      if (created?.id) tickExam(created.id);
      setExamDialog(false);
    } catch (e) {
      if (isSessionEndedError(e)) return;
      // Already there: tick that one instead.
      const existing =
        e instanceof ApiError && e.code === 'DUPLICATE_NAME'
          ? examsQ.data?.find(x => nameKey(x.name) === key)
          : undefined;
      if (existing) {
        tickExam(existing.id);
        setExamDialog(false);
        return;
      }
      setExamDialogError(userMessage(e, 'exam'));
    }
  };

  const manySubjects = (subjectsQ.data?.length ?? 0) > SUBJECT_SCROLL_AFTER;
  const subjectChips = (subjectsQ.data ?? []).map(s => ({
    value: s.id,
    label: s.name,
  }));
  const newSubjectChip = { value: NEW_SUBJECT, label: '+ New subject' };
  // In one scrolling row "+ New subject" goes first, where it can be seen.
  const subjectOptions = manySubjects
    ? [newSubjectChip, ...subjectChips]
    : [...subjectChips, newSubjectChip];
  const examOptions = (examsQ.data ?? []).map(e => ({
    value: e.id,
    label: e.name,
  }));
  const invalidFields = FIELD_ORDER.filter(f => f !== 'form' && errors[f]);

  const loadingRow = (label: string, text: string) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        minHeight: 48,
      }}
    >
      <ActivityIndicator color={colors.accent} accessibilityLabel={label} />
      <Text style={{ color: colors.muted, flexShrink: 1 }}>{text}</Text>
    </View>
  );
  const loadFailedRow = (text: string, onRetry: () => void) => (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.sm,
      }}
    >
      <Text style={{ color: colors.danger, flexShrink: 1 }}>{text}</Text>
      <Button title="Retry" variant="secondary" onPress={onRetry} />
    </View>
  );

  return (
    <View>
      <View ref={box('name')}>
        <TextField
          ref={input('name')}
          label="Topic name"
          value={name}
          onChangeText={t => {
            setName(t);
            clearErrors('name');
          }}
          error={errors.name}
          maxLength={200}
        />
      </View>

      <View ref={box('subject')}>
        <Text style={{ color: colors.muted, marginBottom: spacing.xs }}>
          Subject
        </Text>
        {subjectsQ.isPending ? (
          loadingRow('Loading subjects', 'Loading your subjects…')
        ) : (
          <>
            {subjectsQ.error && !subjectsQ.data
              ? loadFailedRow("Couldn't load your subjects", () => {
                  subjectsQ.refetch();
                })
              : null}
            <ChipSelect
              options={subjectOptions}
              value={subjectChoice}
              groupLabel="Subject"
              scroll={manySubjects}
              onChange={v => {
                setSubjectChoice(v as string);
                clearErrors('subject', 'newSubject');
              }}
            />
          </>
        )}
        {errors.subject ? (
          <Text style={{ color: colors.danger, marginTop: spacing.xs }}>
            {errors.subject}
          </Text>
        ) : null}
      </View>
      {isNew ? (
        <View ref={box('newSubject')} style={{ marginTop: spacing.md }}>
          <TextField
            ref={input('newSubject')}
            label="New subject name"
            value={newSubject}
            onChangeText={t => {
              setNewSubject(t);
              clearErrors('newSubject');
            }}
            error={errors.newSubject}
            maxLength={80}
          />
        </View>
      ) : null}

      <View style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
        <Text style={{ color: colors.muted, marginBottom: spacing.xs }}>
          Exams
        </Text>
        {examsQ.isPending ? (
          loadingRow('Loading exams', 'Loading your exams…')
        ) : examsQ.error && !examsQ.data ? (
          loadFailedRow("Couldn't load your exams", () => {
            examsQ.refetch();
          })
        ) : (
          <>
            {examOptions.length > 0 ? (
              <ChipSelect
                multiple
                options={examOptions}
                value={examIds}
                groupLabel="Exams"
                onChange={v => {
                  examsTouched.current = true;
                  setExamIds(v as string[]);
                  clearErrors();
                }}
              />
            ) : (
              <Text style={{ color: colors.muted }}>No exams yet</Text>
            )}
            <View style={{ flexDirection: 'row' }}>
              <Button
                title="+ New exam"
                variant="text"
                onPress={openExamDialog}
              />
            </View>
          </>
        )}
      </View>

      <View ref={box('studiedOn')}>
        <DateField
          label="Studied on"
          value={studiedOn}
          onChange={d => {
            setStudiedOn(d);
            clearErrors('studiedOn');
          }}
          maximumDate={maxStudiedOn}
        />
        {errors.studiedOn ? (
          <Text style={{ color: colors.danger, marginBottom: spacing.md }}>
            {errors.studiedOn}
          </Text>
        ) : null}
      </View>

      {compact ? null : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showAdvanced }}
            onPress={() => setShowAdvanced(v => !v)}
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Text style={{ color: colors.accent, fontWeight: '600' }}>
              Advanced {showAdvanced ? '▴' : '▾'}
            </Text>
          </Pressable>
          {showAdvanced ? (
            <View ref={box('intervals')}>
              <TextField
                ref={input('intervals')}
                label="Custom revision days (after studying)"
                placeholder="e.g. 4, 7, 15 — leave empty to use your settings"
                value={intervalsText}
                onChangeText={t => {
                  setIntervalsText(t);
                  clearErrors('intervals');
                }}
                error={errors.intervals}
                keyboardType="numeric"
              />
              {doneCount > 0 && !errors.intervals ? (
                <Text
                  style={{
                    color: colors.muted,
                    marginTop: -spacing.sm,
                    marginBottom: spacing.md,
                  }}
                >
                  {doneCount === 1
                    ? "You've done 1 revision, so keep at least 1 interval"
                    : `You've done ${doneCount} revisions, so keep at least ${doneCount} intervals`}
                </Text>
              ) : null}
            </View>
          ) : null}
          <TextField
            label="Notes"
            value={notes}
            onChangeText={t => {
              setNotes(t);
              clearErrors();
            }}
            multiline
            maxLength={2000}
          />
        </>
      )}

      {errors.form ? (
        <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>
          {errors.form}
        </Text>
      ) : null}
      {invalidFields.length > 0 ? (
        <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>
          {fieldSummary(invalidFields.map(f => FIELD_LABEL[f]))}
        </Text>
      ) : null}
      {submitError ? (
        <ErrorRetry error={submitError} onRetry={submit} context="topic" />
      ) : null}
      <Button
        title={submitLabel ?? (mode === 'create' ? 'Add topic' : 'Save')}
        variant={submitVariant}
        onPress={submit}
        loading={saving}
      />

      <ConfirmDialog
        visible={examDialog}
        title="New exam"
        confirmLabel="Add exam"
        busy={createExam.isPending}
        error={examDialogError}
        onConfirm={addExam}
        onCancel={() => setExamDialog(false)}
      >
        <TextField
          label="Exam name"
          value={newExamName}
          onChangeText={t => {
            setNewExamName(t);
            setExamDialogError(null);
          }}
          maxLength={80}
          autoFocus
        />
      </ConfirmDialog>
    </View>
  );
}
