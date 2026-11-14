import React, { useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { localToday, nameKey, type LocalDate } from '@planner/shared';
import { ApiError } from '../../shared/api/errors';
import { Button } from '../../shared/ui/Button';
import { ChipSelect } from '../../shared/ui/ChipSelect';
import { Dialog } from '../../shared/ui/Dialog';
import { fromLocalDate, toLocalDate } from '../../shared/ui/DateField';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { TextField } from '../../shared/ui/TextField';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { formatDate } from '../../shared/lib/format';
import {
  useCreateExam,
  useDeleteExam,
  useExams,
  useUpdateExam,
} from '../exams/hooks';
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
  const today = localToday();
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
          // Exams are in the future: today is the earliest choice.
          value={fromLocalDate(value && value > today ? value : today)}
          minimumDate={fromLocalDate(today)}
          mode="date"
          onChange={(e, d) => {
            setOpen(Platform.OS === 'ios');
            if (e.type === 'set' && d && toLocalDate(d) >= today) {
              onChange(toLocalDate(d));
            }
          }}
        />
      ) : null}
    </View>
  );
}

const cleanName = (s: string) => s.trim().replace(/\s+/g, ' ');

export function ExamStep() {
  const { colors, spacing } = useTheme();
  const navigation = useNavigation();
  const examsQ = useExams();
  const createExam = useCreateExam();
  const updateExam = useUpdateExam();
  const deleteExam = useDeleteExam();
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  // Keyed by nameKey; undefined = untouched (existing exams keep their date).
  const [dates, setDates] = useState<Record<string, LocalDate | null>>({});
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  // Saved exams the user unticked; set while we ask before removing them.
  const [confirmRemove, setConfirmRemove] = useState<string[] | null>(null);
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
  /** The ticked exams plus anything typed in "Add your own". */
  const withDraft = (): string[] => {
    const typed = cleanName(draft);
    if (!typed) return selected;
    const match = names.find(n => nameKey(n) === nameKey(typed)) ?? typed;
    return selected.some(n => nameKey(n) === nameKey(match))
      ? selected
      : [...selected, match];
  };

  function addCustom() {
    const name = cleanName(draft);
    if (!name) return;
    const match = names.find(n => nameKey(n) === nameKey(name)) ?? name;
    if (match === name) setCustom(c => [...c, name]);
    setSelected(s => (s.includes(match) ? s : [...s, match]));
    setDraft('');
  }

  function next() {
    const toSave = withDraft();
    const unticked = (existing ?? [])
      .filter(e => !toSave.some(n => nameKey(n) === nameKey(e.name)))
      .map(e => e.name);
    if (unticked.length > 0) setConfirmRemove(unticked);
    else save(toSave, []);
  }

  function keepUnticked() {
    const keep = confirmRemove ?? [];
    setConfirmRemove(null);
    setSelected(s => [...s, ...keep.filter(n => !s.includes(n))]);
    save([...withDraft(), ...keep], []);
  }

  function removeUnticked() {
    const remove = confirmRemove ?? [];
    setConfirmRemove(null);
    save(withDraft(), remove);
  }

  async function save(toSave: string[], remove: string[]) {
    setError(null);
    setSaving(true);
    try {
      if (cleanName(draft)) addCustom();
      for (const name of toSave) {
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
      for (const name of remove) {
        const have = existingFor(name);
        if (!have) continue;
        try {
          await deleteExam.mutateAsync(have.id);
        } catch (e) {
          // Already gone: fine.
          if (!(e instanceof ApiError) || e.code !== 'NOT_FOUND') throw e;
        }
      }
      navigation.navigate('Intervals' as never);
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  const removing = confirmRemove ?? [];
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
          disabled={selected.length === 0 && !draft.trim()}
          disabledHint="Pick or add at least one exam to continue"
        />
      </View>
      <Dialog
        visible={confirmRemove !== null}
        title={
          removing.length === 1
            ? `Remove ${removing[0]}?`
            : `Remove ${removing.length} exams?`
        }
        onRequestClose={() => setConfirmRemove(null)}
        actions={
          <>
            <Button
              title={removing.length === 1 ? 'Remove exam' : 'Remove exams'}
              variant="danger"
              onPress={removeUnticked}
            />
            <Button
              title={removing.length === 1 ? 'Keep it' : 'Keep them'}
              variant="secondary"
              onPress={keepUnticked}
            />
          </>
        }
      >
        <Text style={{ color: colors.text }}>
          {removing.length === 1
            ? `You unticked ${removing[0]}, which you saved earlier. Any topics you added stay; they just won't be linked to this exam.`
            : `You unticked ${removing.join(
                ', ',
              )}, which you saved earlier. Any topics you added stay; they just won't be linked to these exams.`}
        </Text>
      </Dialog>
    </StepShell>
  );
}
