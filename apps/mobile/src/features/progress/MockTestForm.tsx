import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import {
  localToday,
  mockTestInputSchema,
  type LocalDate,
} from '@planner/shared';
import { Button } from '../../shared/ui/Button';
import { ChipSelect } from '../../shared/ui/ChipSelect';
import { DateField } from '../../shared/ui/DateField';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { TextField } from '../../shared/ui/TextField';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useExams } from '../exams/hooks';
import { useCreateMockTest } from './hooks';

type Field = 'title' | 'takenOn' | 'score' | 'maxScore' | 'form';
type Errors = Partial<Record<Field, string>>;

const FIELDS: string[] = ['title', 'takenOn', 'score', 'maxScore'];
const toNumber = (t: string) =>
  t.trim() === '' ? NaN : Number(t.trim().replace(',', '.'));

export function MockTestForm({
  onSaved,
  onDirtyChange,
}: {
  onSaved: () => void;
  /** Told whether anything has been typed or changed. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { colors, spacing } = useTheme();
  const examsQ = useExams();
  const create = useCreateMockTest();

  const [title, setTitle] = useState('');
  const [takenOn, setTakenOn] = useState<LocalDate>(localToday());
  const [score, setScore] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [examId, setExamId] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const openedOn = useRef(takenOn).current;
  const dirty =
    title !== '' ||
    score !== '' ||
    maxScore !== '' ||
    examId !== '' ||
    takenOn !== openedOn;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  async function submit() {
    setSubmitError(null);
    const parsed = mockTestInputSchema.safeParse({
      title,
      takenOn,
      score: toNumber(score),
      maxScore: toNumber(maxScore),
      examId: examId || null,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        const numeric = key === 'score' || key === 'maxScore';
        const msg =
          numeric && issue.code === 'invalid_type'
            ? 'Enter a number'
            : key === 'title' && issue.code === 'too_small'
            ? 'Enter a title'
            : issue.message;
        const field = (FIELDS.includes(key) ? key : 'form') as Field;
        next[field] ??= msg;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await create.mutateAsync(parsed.data);
      onSaved();
    } catch (e) {
      setSubmitError(e);
    } finally {
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

  return (
    <View>
      <TextField
        label="Title"
        value={title}
        onChangeText={t => {
          setTitle(t);
          clearErrors('title');
        }}
        error={errors.title}
        maxLength={120}
      />
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
      <TextField
        label="Score"
        value={score}
        onChangeText={t => {
          setScore(t);
          clearErrors('score', 'maxScore');
        }}
        error={errors.score}
        keyboardType="decimal-pad"
      />
      <TextField
        label="Max score"
        value={maxScore}
        onChangeText={t => {
          setMaxScore(t);
          clearErrors('score', 'maxScore');
        }}
        error={errors.maxScore}
        keyboardType="decimal-pad"
      />
      {examOptions.length > 0 ? (
        <View style={{ marginBottom: spacing.md }}>
          <Text style={{ color: colors.muted, marginBottom: spacing.xs }}>
            Exam (optional)
          </Text>
          <ChipSelect
            options={examOptions}
            value={examId}
            onChange={v => {
              setExamId(examId === v ? '' : (v as string));
              clearErrors();
            }}
          />
        </View>
      ) : null}
      {errors.form ? (
        <Text style={{ color: colors.danger, marginBottom: spacing.sm }}>
          {errors.form}
        </Text>
      ) : null}
      {submitError ? <ErrorRetry error={submitError} onRetry={submit} /> : null}
      <Button title="Save" onPress={submit} loading={saving} />
    </View>
  );
}
