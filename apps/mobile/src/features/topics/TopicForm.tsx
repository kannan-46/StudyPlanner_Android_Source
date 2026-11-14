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
import {
  localToday,
  nameKey,
  subjectInputSchema,
  topicCreateSchema,
  topicUpdateSchema,
  type LocalDate,
  type TopicCreateInput,
  type TopicUpdateInput,
  type TopicView,
} from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { ApiError } from '../../shared/api/errors';
import { formatDate } from '../../shared/lib/format';
import { Button, type ButtonVariant } from '../../shared/ui/Button';
import { ChipSelect } from '../../shared/ui/ChipSelect';
import { DateField } from '../../shared/ui/DateField';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { ScreenScrollContext } from '../../shared/ui/Screen';
import { TextField } from '../../shared/ui/TextField';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useExams } from '../exams/hooks';
import { useCreateSubject, useSubjects } from '../subjects/hooks';
import { useCreateTopic, useUpdateTopic } from './hooks';

const NEW_SUBJECT = '__new__';
/** Stands in for the not-yet-created subject while validating. */
const PLACEHOLDER_ID = '0'.repeat(24);

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

export const MSG = {
  name: 'Enter a topic name',
  subject: 'Choose a subject',
  newSubject: 'Enter a name for the new subject',
  intervals: 'Use numbers that increase, like 4, 7, 15',
  intervalRange: 'Each interval must be between 1 and 999 days',
  intervalCount: 'Use 20 intervals or fewer',
  studiedAfterDone: "This date can't be after a revision you've already done",
  form: 'Something here needs fixing — check the form and try again',
};

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

/** Turns the API's VALIDATION_FAILED details into messages under fields. */
function serverFieldErrors(e: unknown): Errors | null {
  if (!(e instanceof ApiError) || e.code !== 'VALIDATION_FAILED') return null;
  const out: Errors = {};
  const details = Array.isArray(e.details) ? e.details : [];
  for (const d of details as { path?: unknown[] }[]) {
    const key = Array.isArray(d?.path) ? d.path[0] : undefined;
    if (key === 'studiedOn') out.studiedOn ??= MSG.studiedAfterDone;
    else if (key === 'name') out.name ??= 'Check the topic name';
    else if (key === 'intervals') out.intervals ??= MSG.intervals;
    else if (key === 'subjectId') {
      out.subject ??= 'That subject no longer exists — choose another';
    } else if (key === 'examIds') {
      out.form ??=
        'One of the chosen exams no longer exists — untick it and try again';
    }
  }
  if (Object.keys(out).length === 0) out.form = MSG.form;
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
}: TopicFormProps) {
  const { colors, spacing } = useTheme();
  const { subjects: subjectsApi, me: meApi } = useApi();
  const scroll = useContext(ScreenScrollContext);
  const subjectsQ = useSubjects();
  const examsQ = useExams();
  const createTopic = useCreateTopic();
  const updateTopic = useUpdateTopic();
  const createSubject = useCreateSubject();

  const [name, setName] = useState(initial?.name ?? '');
  const [subjectChoice, setSubjectChoice] = useState<string>(
    initial?.subjectId ?? '',
  );
  const [newSubject, setNewSubject] = useState('');
  const [examIds, setExamIds] = useState<string[]>(initial?.examIds ?? []);
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
  const today = localToday();
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
    if (revealErrors === 0) return;
    const first = FIELD_ORDER.find(f => errors[f]);
    if (!first) return;
    scroll?.scrollToView(boxes.current[first] ?? null);
    inputs.current[first]?.focus();
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

  async function resolveSubjectId(): Promise<string> {
    if (!isNew) return subjectChoice;
    const parsedName = subjectInputSchema.parse({ name: newSubject });
    const key = nameKey(parsedName.name);
    if (createdSubject.current?.key === key) return createdSubject.current.id;
    let id: string;
    try {
      id = (await createSubject.mutateAsync(parsedName)).id;
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
      examIds,
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
    try {
      const subjectId = await resolveSubjectId();
      if (mode === 'create') {
        const created = await createTopic.mutateAsync({
          ...parsed.data,
          subjectId,
        } satisfies TopicCreateInput);
        if (clearNameOnSave) {
          openedRef.current = {
            name: '',
            subjectChoice,
            newSubject,
            examIds,
            studiedOn,
            intervalsText,
            notes,
          };
          setName('');
        }
        onSaved(created);
        return created;
      }
      if (!initial) return null;
      const patch: TopicUpdateInput = {};
      if (parsed.data.name !== initial.name) patch.name = parsed.data.name;
      if (subjectId !== initial.subjectId) patch.subjectId = subjectId;
      if (!sameSet(parsed.data.examIds, initial.examIds)) {
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
      }
      if (wanted && wanted.join(',') !== initial.intervals.join(',')) {
        patch.intervals = wanted;
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
      // A field the server rejected goes under that field; Retry would only
      // fail again, so it is kept for connection and server problems.
      const fieldErrors = serverFieldErrors(e);
      if (fieldErrors) fail(fieldErrors);
      else setSubmitError(e);
      return null;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  useImperativeHandle(ref, () => ({ submit, hasDraft: () => hasDraft }));

  const subjectOptions = [
    ...(subjectsQ.data ?? []).map(s => ({ value: s.id, label: s.name })),
    { value: NEW_SUBJECT, label: '+ New subject' },
  ];
  const examOptions = (examsQ.data ?? []).map(e => ({
    value: e.id,
    label: e.name,
  }));
  const fieldErrorCount = FIELD_ORDER.filter(
    f => f !== 'form' && errors[f],
  ).length;

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
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              minHeight: 48,
            }}
          >
            <ActivityIndicator
              color={colors.accent}
              accessibilityLabel="Loading subjects"
            />
            <Text style={{ color: colors.muted }}>Loading your subjects…</Text>
          </View>
        ) : (
          <>
            {subjectsQ.error && !subjectsQ.data ? (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: spacing.sm,
                  marginBottom: spacing.sm,
                }}
              >
                <Text style={{ color: colors.danger, flexShrink: 1 }}>
                  Couldn't load your subjects.
                </Text>
                <Button
                  title="Retry"
                  variant="secondary"
                  onPress={() => subjectsQ.refetch()}
                />
              </View>
            ) : null}
            <ChipSelect
              options={subjectOptions}
              value={subjectChoice}
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

      {examOptions.length > 0 ? (
        <View style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
          <Text style={{ color: colors.muted, marginBottom: spacing.xs }}>
            Exams
          </Text>
          <ChipSelect
            multiple
            options={examOptions}
            value={examIds}
            onChange={v => {
              setExamIds(v as string[]);
              clearErrors();
            }}
          />
        </View>
      ) : (
        <View style={{ height: spacing.md }} />
      )}

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
                label="Custom intervals (days)"
                placeholder="e.g. 4, 7, 15 — leave empty to use your settings"
                value={intervalsText}
                onChangeText={t => {
                  setIntervalsText(t);
                  clearErrors('intervals');
                }}
                error={errors.intervals}
                keyboardType="numeric"
              />
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
      {fieldErrorCount > 0 ? (
        <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>
          {fieldErrorCount === 1
            ? 'Fix the field marked in red above.'
            : 'Fix the fields marked in red above.'}
        </Text>
      ) : null}
      {submitError ? <ErrorRetry error={submitError} onRetry={submit} /> : null}
      <Button
        title={submitLabel ?? (mode === 'create' ? 'Add topic' : 'Save')}
        variant={submitVariant}
        onPress={submit}
        loading={saving}
      />
    </View>
  );
}
