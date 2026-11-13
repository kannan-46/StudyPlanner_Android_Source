import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { localToday, nameKey, type LocalDate } from '@planner/shared';
import { ApiError } from '../../shared/api/errors';
import { Button } from '../../shared/ui/Button';
import { ChipSelect } from '../../shared/ui/ChipSelect';
import { DateField } from '../../shared/ui/DateField';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { TextField } from '../../shared/ui/TextField';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useCreateExam, useExams } from '../exams/hooks';
import { StepShell } from './StepShell';

const QUICK_PICKS = ['NEET SS', 'MS General Surgery'];

export function ExamStep() {
  const { colors, spacing } = useTheme();
  const navigation = useNavigation();
  const examsQ = useExams();
  const createExam = useCreateExam();
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [examDate, setExamDate] = useState<LocalDate | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const preselected = useRef(false);

  const existing = examsQ.data;
  useEffect(() => {
    if (!existing || preselected.current) return;
    preselected.current = true;
    setSelected(prev => [
      ...existing.map(e => e.name).filter(n => !prev.includes(n)),
      ...prev,
    ]);
  }, [existing]);

  const names: string[] = [];
  for (const n of [
    ...QUICK_PICKS,
    ...(existing ?? []).map(e => e.name),
    ...custom,
  ]) {
    if (!names.some(x => nameKey(x) === nameKey(n))) names.push(n);
  }

  function addCustom() {
    const name = draft.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const match = names.find(n => nameKey(n) === nameKey(name)) ?? name;
    if (match === name) setCustom(c => [...c, name]);
    setSelected(s => (s.includes(match) ? s : [...s, match]));
    setDraft('');
  }

  async function next() {
    setError(null);
    setSaving(true);
    try {
      const have = new Set((existing ?? []).map(e => nameKey(e.name)));
      for (const name of selected) {
        if (have.has(nameKey(name))) continue;
        try {
          await createExam.mutateAsync(
            examDate ? { name, examDate } : { name },
          );
        } catch (e) {
          // Already exists (for example from an earlier attempt): fine.
          if (!(e instanceof ApiError) || e.code !== 'DUPLICATE_NAME') throw e;
        }
      }
      navigation.navigate('Intervals' as never);
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <StepShell step={1} title="Which exams are you preparing for?">
      <ChipSelect
        multiple
        options={names.map(n => ({ value: n, label: n }))}
        value={selected}
        onChange={v => setSelected(v as string[])}
      />
      <View style={{ marginTop: spacing.lg }}>
        <TextField
          label="Add your own"
          value={draft}
          onChangeText={setDraft}
          maxLength={80}
          returnKeyType="done"
          onSubmitEditing={addCustom}
        />
        <Button
          title="Add exam"
          variant="secondary"
          onPress={addCustom}
          disabled={!draft.trim()}
        />
      </View>
      <View style={{ marginTop: spacing.lg }}>
        {examDate ? (
          <>
            <DateField
              label="Exam date (optional)"
              value={examDate}
              onChange={setExamDate}
            />
            <Button
              title="Clear exam date"
              variant="text"
              onPress={() => setExamDate(null)}
            />
          </>
        ) : (
          <Button
            title="Set exam date (optional)"
            variant="secondary"
            onPress={() => setExamDate(localToday())}
          />
        )}
        <Text style={{ color: colors.muted, marginTop: spacing.xs }}>
          The date applies to exams added in this step.
        </Text>
      </View>
      {error ? <ErrorRetry error={error} onRetry={next} /> : null}
      <View style={{ marginTop: spacing.lg }}>
        <Button
          title="Next"
          onPress={next}
          loading={saving}
          disabled={selected.length === 0}
        />
      </View>
    </StepShell>
  );
}
