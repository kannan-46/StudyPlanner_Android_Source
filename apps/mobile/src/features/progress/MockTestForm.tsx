import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  Text,
  View,
  type HostInstance,
  type TextInputInstance,
} from 'react-native';
import {
  localToday,
  mockTestInputSchema,
  type LocalDate,
  type MockTestUpdate,
  type MockTestView,
} from '@planner/shared';
import { ApiError } from '../../shared/api/errors';
import { announce } from '../../shared/ui/announce';
import { Button } from '../../shared/ui/Button';
import { ChipSelect } from '../../shared/ui/ChipSelect';
import { DateField } from '../../shared/ui/DateField';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { ScreenScrollContext } from '../../shared/ui/Screen';
import { TextField } from '../../shared/ui/TextField';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useExams } from '../exams/hooks';
import { useCreateMockTest, useUpdateMockTest } from './hooks';

type Field =
  | 'title'
  | 'takenOn'
  | 'score'
  | 'maxScore'
  | 'exam'
  | 'notes'
  | 'form';
type Errors = Partial<Record<Field, string>>;

/** Top-to-bottom, so the first one with an error is scrolled to. */
const FIELD_ORDER: Field[] = [
  'title',
  'takenOn',
  'score',
  'maxScore',
  'exam',
  'notes',
  'form',
];
/** How each field is named in "Fix the … above" and when read out. */
const FIELD_NAMES: Record<Exclude<Field, 'form'>, string> = {
  title: 'title',
  takenOn: 'date',
  score: 'score',
  maxScore: 'max score',
  exam: 'exam',
  notes: 'notes',
};
const SCHEMA_FIELDS: Partial<Record<string, Exclude<Field, 'form'>>> = {
  title: 'title',
  takenOn: 'takenOn',
  score: 'score',
  maxScore: 'maxScore',
  examId: 'exam',
  notes: 'notes',
};

export const MOCK_MSG = {
  title: 'Enter a title',
  number: 'Enter a number',
  examGone: 'That exam no longer exists — choose another',
  form: 'Something here needs fixing — check the form and try again',
};

const toNumber = (t: string) =>
  t.trim() === '' ? NaN : Number(t.trim().replace(',', '.'));

const joinAnd = (parts: string[]) =>
  parts.length <= 1
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

/** Turns the API's VALIDATION_FAILED details into messages under fields. */
function serverFieldErrors(e: unknown): Errors | null {
  if (!(e instanceof ApiError) || e.code !== 'VALIDATION_FAILED') return null;
  const out: Errors = {};
  const details = Array.isArray(e.details) ? e.details : [];
  for (const d of details as { path?: unknown[] }[]) {
    const key = Array.isArray(d?.path) ? String(d.path[0]) : '';
    const field = SCHEMA_FIELDS[key];
    if (field === 'exam') out.exam ??= MOCK_MSG.examGone;
    else if (field === 'title') out.title ??= 'Check the title';
    else if (field === 'notes')
      out.notes ??= 'Notes can be up to 1,000 characters';
    else if (field) out[field] ??= `Check the ${FIELD_NAMES[field]}`;
  }
  if (Object.keys(out).length === 0) out.form = MOCK_MSG.form;
  return out;
}

export function MockTestForm({
  initial,
  onSaved,
  onDirtyChange,
  onSavingChange,
}: {
  /** The saved test, when editing; the form starts with its values. */
  initial?: MockTestView;
  onSaved: () => void;
  /** Told whether anything has been typed or changed. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Told while a save is running (to hold the screen open meanwhile). */
  onSavingChange?: (saving: boolean) => void;
}) {
  const { colors, spacing } = useTheme();
  const scroll = useContext(ScreenScrollContext);
  const examsQ = useExams();
  const create = useCreateMockTest();
  const update = useUpdateMockTest();

  // What the form opened with. `examId` becomes '' if that exam turns out to
  // have been deleted, so the form neither shows nor sends it.
  const start = useRef({
    title: initial?.title ?? '',
    takenOn: initial?.takenOn ?? localToday(),
    score: initial ? String(initial.score) : '',
    maxScore: initial ? String(initial.maxScore) : '',
    examId: initial?.examId ?? '',
    notes: initial?.notes ?? '',
  }).current;
  const [title, setTitle] = useState(start.title);
  const [takenOn, setTakenOn] = useState<LocalDate>(start.takenOn);
  const [score, setScore] = useState(start.score);
  const [maxScore, setMaxScore] = useState(start.maxScore);
  const [examId, setExamId] = useState(start.examId);
  const [notes, setNotes] = useState(start.notes);
  const [errors, setErrors] = useState<Errors>({});
  // Bumped after a failed save so the effect below scrolls to the first error.
  const [revealErrors, setRevealErrors] = useState(0);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  // Where each field sits, to scroll to (and focus) the first invalid one.
  const boxes = useRef<Partial<Record<Field, HostInstance | null>>>({});
  const inputs = useRef<Partial<Record<Field, TextInputInstance | null>>>({});
  const box = (f: Field) => (v: HostInstance | null) => {
    boxes.current[f] = v;
  };
  const input = (f: Field) => (v: TextInputInstance | null) => {
    inputs.current[f] = v;
  };

  // An exam deleted since the test was saved: start with no exam chosen.
  useEffect(() => {
    const list = examsQ.data;
    if (!list || !examId || list.some(e => e.id === examId)) return;
    if (start.examId === examId) start.examId = '';
    setExamId('');
  }, [examsQ.data, examId, start]);

  const dirty =
    title !== start.title ||
    score !== start.score ||
    maxScore !== start.maxScore ||
    examId !== start.examId ||
    takenOn !== start.takenOn ||
    notes !== start.notes;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);

  useEffect(() => {
    if (revealErrors === 0) return;
    const first = FIELD_ORDER.find(f => errors[f]);
    if (!first) return;
    scroll?.scrollToView(boxes.current[first] ?? null);
    const field = inputs.current[first];
    if (field) {
      // A focused field reads its own error.
      field.focus();
    } else {
      // The date, exam and form errors have no box to focus: say them.
      const name = first === 'form' ? null : FIELD_NAMES[first];
      const message = errors[first];
      announce(
        name ? `${name[0].toUpperCase()}${name.slice(1)}: ${message}` : message,
      );
    }
    // Only after a failed save, not while the user is fixing fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealErrors]);

  const fail = (next: Errors) => {
    setErrors(next);
    setRevealErrors(n => n + 1);
  };

  async function submit() {
    if (busy.current) return;
    setSubmitError(null);
    const parsed = mockTestInputSchema.safeParse({
      title,
      takenOn,
      score: toNumber(score),
      maxScore: toNumber(maxScore),
      examId: examId || null,
      notes,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        const numeric = key === 'score' || key === 'maxScore';
        const msg =
          numeric && issue.code === 'invalid_type'
            ? MOCK_MSG.number
            : key === 'title' && issue.code === 'too_small'
            ? MOCK_MSG.title
            : issue.message;
        const field = SCHEMA_FIELDS[key] ?? 'form';
        next[field] ??= msg;
      }
      fail(next);
      return;
    }
    setErrors({});
    busy.current = true;
    setSaving(true);
    try {
      if (initial) {
        const d = parsed.data;
        const patch: MockTestUpdate = {
          title: d.title,
          takenOn: d.takenOn,
          score: d.score,
          maxScore: d.maxScore,
        };
        // Sent only when changed, so a link to an exam that has since been
        // deleted is never sent back.
        if ((d.examId ?? '') !== start.examId) patch.examId = d.examId ?? null;
        if (d.notes !== start.notes) patch.notes = d.notes;
        await update.mutateAsync({ id: initial.id, patch });
      } else {
        await create.mutateAsync(parsed.data);
      }
      onSaved();
    } catch (e) {
      // A field the server rejected goes under that field; Retry would only
      // fail again, so it is kept for connection and server problems.
      const fieldErrors = serverFieldErrors(e);
      if (fieldErrors) {
        if (fieldErrors.exam) examsQ.refetch();
        fail(fieldErrors);
      } else {
        setSubmitError(e);
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  /** Editing a field clears its own error (score and max go together). */
  const clearErrors = (...fields: Field[]) => {
    setSubmitError(null);
    setErrors(e => {
      const next = { ...e, form: undefined };
      for (const f of fields) next[f] = undefined;
      return next;
    });
  };

  const examOptions = (examsQ.data ?? []).map(e => ({
    value: e.id,
    label: e.name,
  }));
  const fieldsWithErrors = FIELD_ORDER.filter(
    (f): f is Exclude<Field, 'form'> => f !== 'form' && !!errors[f],
  );

  return (
    <View>
      <View ref={box('title')}>
        <TextField
          ref={input('title')}
          label="Title"
          value={title}
          onChangeText={t => {
            setTitle(t);
            clearErrors('title');
          }}
          error={errors.title}
          maxLength={120}
        />
      </View>
      <View ref={box('takenOn')}>
        <DateField
          label="Date"
          value={takenOn}
          onChange={d => {
            setTakenOn(d);
            clearErrors('takenOn');
          }}
          maximumDate={localToday()}
        />
        {errors.takenOn ? (
          <Text style={{ color: colors.danger, marginBottom: spacing.md }}>
            {errors.takenOn}
          </Text>
        ) : null}
      </View>
      <View ref={box('score')}>
        <TextField
          ref={input('score')}
          label="Score"
          value={score}
          onChangeText={t => {
            setScore(t);
            clearErrors('score', 'maxScore');
          }}
          error={errors.score}
          keyboardType="decimal-pad"
        />
      </View>
      <View ref={box('maxScore')}>
        <TextField
          ref={input('maxScore')}
          label="Max score"
          value={maxScore}
          onChangeText={t => {
            setMaxScore(t);
            clearErrors('score', 'maxScore');
          }}
          error={errors.maxScore}
          keyboardType="decimal-pad"
        />
      </View>
      {examOptions.length > 0 ? (
        <View ref={box('exam')} style={{ marginBottom: spacing.md }}>
          <ChipSelect
            label="Exam (optional)"
            options={examOptions}
            value={examId}
            onChange={v => {
              setExamId(examId === v ? '' : (v as string));
              clearErrors('exam');
            }}
          />
          {errors.exam ? (
            <Text style={{ color: colors.danger, marginTop: spacing.xs }}>
              {errors.exam}
            </Text>
          ) : null}
        </View>
      ) : errors.exam ? (
        <View ref={box('exam')}>
          <Text style={{ color: colors.danger, marginBottom: spacing.md }}>
            {errors.exam}
          </Text>
        </View>
      ) : null}
      <View ref={box('notes')}>
        <TextField
          ref={input('notes')}
          label="Notes (optional)"
          value={notes}
          onChangeText={t => {
            setNotes(t);
            clearErrors('notes');
          }}
          error={errors.notes}
          multiline
          maxLength={1000}
        />
      </View>
      <View ref={box('form')}>
        {errors.form ? (
          <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>
            {errors.form}
          </Text>
        ) : null}
      </View>
      {fieldsWithErrors.length > 0 ? (
        <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>
          {`Fix the ${joinAnd(
            fieldsWithErrors.map(f => FIELD_NAMES[f]),
          )} above`}
        </Text>
      ) : null}
      {submitError ? (
        <ErrorRetry error={submitError} context="mockTest" onRetry={submit} />
      ) : null}
      <Button
        title={initial ? 'Save changes' : 'Save'}
        onPress={submit}
        loading={saving}
      />
    </View>
  );
}
