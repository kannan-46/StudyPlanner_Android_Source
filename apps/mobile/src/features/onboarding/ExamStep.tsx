import React, { useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { nameKey, type LocalDate } from '@planner/shared';
import { ApiError } from '../../shared/api/errors';
import { Button } from '../../shared/ui/Button';
import { ChipSelect } from '../../shared/ui/ChipSelect';
import { fromLocalDate, toLocalDate } from '../../shared/ui/DateField';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { TextField } from '../../shared/ui/TextField';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { formatDate } from '../../shared/lib/format';
import { useCreateExam, useExams, useUpdateExam } from '../exams/hooks';
import { StepShell } from './StepShell';

const QUICK_PICKS = ['NEET SS', 'MS General Surgery'];

/** Optional date for one exam; nothing is saved until the user picks one. */
function ExamDateRow({
  name,
  value,
  onChange,
}: {
  name: string;
  value: LocalDate | null;
  onChange: (d: LocalDate | null) => void;
}) {
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.sm,
      }}
    >
      <Text style={{ color: colors.text, flexShrink: 1 }}>
        {`${name} exam date (optional): ${value ? formatDate(value) : 'none'}`}
      </Text>
      <Button
        title={value ? `Change date for ${name}` : `Set date for ${name}`}
        variant="secondary"
        onPress={() => setOpen(true)}
      />
      {value ? (
        <Button
          title={`Clear date for ${name}`}
          variant="text"
          onPress={() => onChange(null)}
        />
      ) : null}
      {open ? (
        <DateTimePicker
          value={value ? fromLocalDate(value) : new Date()}
          mode="date"
          onChange={(e, d) => {
            setOpen(Platform.OS === 'ios');
            if (e.type === 'set' && d) onChange(toLocalDate(d));
          }}
        />
      ) : null}
    </View>
  );
}

export function ExamStep() {
  const { spacing } = useTheme();
  const navigation = useNavigation();
  const examsQ = useExams();
  const createExam = useCreateExam();
  const updateExam = useUpdateExam();
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  // Keyed by nameKey; undefined = untouched (existing exams keep their date).
  const [dates, setDates] = useState<Record<string, LocalDate | null>>({});
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
  const existingFor = (name: string) =>
    existing?.find(e => nameKey(e.name) === nameKey(name));
  const dateFor = (name: string): LocalDate | null => {
    const k = nameKey(name);
    return k in dates ? dates[k] ?? null : existingFor(name)?.examDate ?? null;
  };

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
      for (const name of selected) {
        const date = dateFor(name);
        const have = existingFor(name);
        if (have) {
          if (nameKey(name) in dates && date !== have.examDate) {
            await updateExam.mutateAsync({
              id: have.id,
              patch: { examDate: date },
            });
          }
          continue;
        }
        try {
          await createExam.mutateAsync(
            date ? { name, examDate: date } : { name },
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
      {selected.length > 0 ? (
        <View style={{ marginTop: spacing.lg }}>
          {selected.map(name => (
            <ExamDateRow
              key={nameKey(name)}
              name={name}
              value={dateFor(name)}
              onChange={d => setDates(m => ({ ...m, [nameKey(name)]: d }))}
            />
          ))}
        </View>
      ) : null}
      {error ? <ErrorRetry error={error} onRetry={next} /> : null}
      <View style={{ marginTop: spacing.lg }}>
        <Button
          title="Next"
          onPress={next}
          loading={saving}
          disabled={selected.length === 0}
          disabledHint="Choose at least one exam to continue"
        />
      </View>
    </StepShell>
  );
}
