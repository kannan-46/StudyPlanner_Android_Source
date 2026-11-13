import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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
import { Button } from '../../shared/ui/Button';
import { ChipSelect } from '../../shared/ui/ChipSelect';
import { DateField } from '../../shared/ui/DateField';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { TextField } from '../../shared/ui/TextField';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useExams } from '../exams/hooks';
import { useCreateSubject, useSubjects } from '../subjects/hooks';
import { useCreateTopic, useUpdateTopic } from './hooks';

const NEW_SUBJECT = '__new__';
/** Stands in for the not-yet-created subject while validating. */
const PLACEHOLDER_ID = '0'.repeat(24);

type Field = 'name' | 'subject' | 'newSubject' | 'studiedOn' | 'intervals';
type Errors = Partial<Record<Field, string>>;

export type TopicFormProps = {
  mode: 'create' | 'edit';
  initial?: TopicView;
  /** Compact (onboarding): name, subject, exams and date only. */
  compact?: boolean;
  onSaved: (topic: TopicView) => void;
};

function parseIntervals(text: string): number[] | undefined | 'invalid' {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return undefined;
  const nums = parts.map(Number);
  return nums.some(n => !Number.isInteger(n)) ? 'invalid' : nums;
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every(x => b.includes(x));

export function TopicForm({ mode, initial, compact, onSaved }: TopicFormProps) {
  const { colors, spacing } = useTheme();
  const { subjects: subjectsApi } = useApi();
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
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  // A subject created by a failed attempt is reused on Retry.
  const createdSubject = useRef<{ key: string; id: string } | null>(null);

  const isNew = subjectChoice === NEW_SUBJECT;

  async function resolveSubjectId(): Promise<string> {
    if (!isNew) return subjectChoice;
    const input = subjectInputSchema.parse({ name: newSubject });
    const key = nameKey(input.name);
    if (createdSubject.current?.key === key) return createdSubject.current.id;
    let id: string;
    try {
      id = (await createSubject.mutateAsync(input)).id;
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

  async function submit() {
    setSubmitError(null);
    const next: Errors = {};
    const intervals = compact ? undefined : parseIntervals(intervalsText);
    if (intervals === 'invalid') {
      next.intervals = 'Use whole numbers like 4, 7, 15';
    }
    if (!subjectChoice) next.subject = 'Choose a subject';
    if (isNew) {
      const r = subjectInputSchema.safeParse({ name: newSubject });
      if (!r.success) next.newSubject = r.error.issues[0]?.message;
    }
    const draft = {
      name,
      subjectId: isNew || !subjectChoice ? PLACEHOLDER_ID : subjectChoice,
      examIds,
      studiedOn,
      intervals: intervals === 'invalid' ? undefined : intervals,
      notes,
    };
    const parsed = topicCreateSchema.safeParse(draft);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'name') next.name ??= issue.message;
        else if (key === 'studiedOn') next.studiedOn ??= issue.message;
        else if (key === 'intervals') next.intervals ??= issue.message;
      }
    }
    if (Object.keys(next).length > 0 || !parsed.success) {
      setErrors(next);
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      const subjectId = await resolveSubjectId();
      if (mode === 'create') {
        const input: TopicCreateInput = { ...parsed.data, subjectId };
        onSaved(await createTopic.mutateAsync(input));
        return;
      }
      if (!initial) return;
      const patch: TopicUpdateInput = {};
      if (parsed.data.name !== initial.name) patch.name = parsed.data.name;
      if (subjectId !== initial.subjectId) patch.subjectId = subjectId;
      if (!sameSet(parsed.data.examIds, initial.examIds)) {
        patch.examIds = parsed.data.examIds;
      }
      if (parsed.data.studiedOn !== initial.studiedOn) {
        patch.studiedOn = parsed.data.studiedOn;
      }
      if (
        parsed.data.intervals &&
        parsed.data.intervals.join(',') !== initial.intervals.join(',')
      ) {
        patch.intervals = parsed.data.intervals;
      }
      if (parsed.data.notes !== initial.notes) patch.notes = parsed.data.notes;
      if (Object.keys(patch).length === 0) {
        onSaved(initial);
        return;
      }
      const checked = topicUpdateSchema.safeParse(patch);
      if (!checked.success) {
        setErrors({ intervals: checked.error.issues[0]?.message });
        return;
      }
      onSaved(
        await updateTopic.mutateAsync({ id: initial.id, patch: checked.data }),
      );
    } catch (e) {
      setSubmitError(e);
    } finally {
      setSaving(false);
    }
  }

  const subjectOptions = [
    ...(subjectsQ.data ?? []).map(s => ({ value: s.id, label: s.name })),
    { value: NEW_SUBJECT, label: '+ New subject' },
  ];
  const examOptions = (examsQ.data ?? []).map(e => ({
    value: e.id,
    label: e.name,
  }));

  return (
    <View>
      <TextField
        label="Topic name"
        value={name}
        onChangeText={setName}
        error={errors.name}
        maxLength={200}
      />

      <Text style={{ color: colors.muted, marginBottom: spacing.xs }}>
        Subject
      </Text>
      <ChipSelect
        options={subjectOptions}
        value={subjectChoice}
        onChange={v => setSubjectChoice(v as string)}
      />
      {errors.subject ? (
        <Text style={{ color: colors.danger, marginTop: spacing.xs }}>
          {errors.subject}
        </Text>
      ) : null}
      {isNew ? (
        <View style={{ marginTop: spacing.md }}>
          <TextField
            label="New subject name"
            value={newSubject}
            onChangeText={setNewSubject}
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
            onChange={v => setExamIds(v as string[])}
          />
        </View>
      ) : (
        <View style={{ height: spacing.md }} />
      )}

      <DateField
        label="Studied on"
        value={studiedOn}
        onChange={setStudiedOn}
        maximumDate={localToday()}
      />
      {errors.studiedOn ? (
        <Text style={{ color: colors.danger, marginBottom: spacing.md }}>
          {errors.studiedOn}
        </Text>
      ) : null}

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
            <TextField
              label="Custom intervals (days)"
              placeholder="e.g. 4, 7, 15 — empty uses your settings"
              value={intervalsText}
              onChangeText={setIntervalsText}
              error={errors.intervals}
              keyboardType="numbers-and-punctuation"
            />
          ) : errors.intervals ? (
            <Text style={{ color: colors.danger }}>{errors.intervals}</Text>
          ) : null}
          <TextField
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={2000}
          />
        </>
      )}

      {submitError ? <ErrorRetry error={submitError} onRetry={submit} /> : null}
      <Button
        title={mode === 'create' ? 'Add topic' : 'Save'}
        onPress={submit}
        loading={saving}
      />
    </View>
  );
}
