import React, { useMemo, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  DEFAULT_SETTINGS,
  createSchedule,
  intervalsSchema,
  localToday,
} from '@planner/shared';
import { Button } from '../../shared/ui/Button';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { TextField } from '../../shared/ui/TextField';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { formatDate } from '../../shared/lib/format';
import { useMe, useUpdateMe } from '../me/hooks';
import { StepShell } from './StepShell';

function parse(text: string): { value?: number[]; error?: string } {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  const nums = parts.map(Number);
  if (parts.length === 0 || nums.some(n => !Number.isInteger(n))) {
    return { error: 'Use whole numbers like 4, 7, 15' };
  }
  const r = intervalsSchema.safeParse(nums);
  return r.success
    ? { value: r.data }
    : { error: r.error.issues[0]?.message ?? 'Invalid intervals' };
}

export function IntervalsStep() {
  const { colors, spacing } = useTheme();
  const navigation = useNavigation();
  const meQ = useMe();
  const updateMe = useUpdateMe();
  const [edited, setEdited] = useState<string | null>(null);
  // Errors wait until the user leaves the field or taps Next, never mid-typing.
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const initial = (
    meQ.data?.settings?.intervals ?? DEFAULT_SETTINGS.intervals
  ).join(', ');
  const text = edited ?? initial;
  const parsed = parse(text);

  // While typing, keep showing the last valid preview instead of blanking it.
  const lastValid = useRef<number[] | undefined>(undefined);
  if (parsed.value) lastValid.current = parsed.value;
  const shown = parsed.value ?? (touched ? undefined : lastValid.current);
  const preview = useMemo(() => {
    if (!shown) return [];
    const today = localToday();
    return createSchedule(today, shown, () => 'p').revisions.map(r => ({
      step: r.step,
      date: formatDate(r.dueOn, today),
    }));
  }, [shown]);

  async function next() {
    if (!parsed.value) {
      setTouched(true);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateMe.mutateAsync({ settings: { intervals: parsed.value } });
      navigation.navigate('Reminders' as never);
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <StepShell step={2} title="Revision gaps">
      <Text style={{ color: colors.text, marginBottom: spacing.lg }}>
        After you study a topic, we remind you to revise it after these many
        days. Each gap grows so it sticks.
      </Text>
      <TextField
        label="Intervals (days)"
        value={text}
        onChangeText={t => {
          setEdited(t);
          setTouched(false);
        }}
        onBlur={() => setTouched(true)}
        error={touched ? parsed.error : undefined}
        keyboardType={
          Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'
        }
      />
      <Text style={{ color: colors.muted, marginBottom: spacing.md }}>
        Separate the days with commas or spaces, like 4, 7, 15
      </Text>
      {preview.length > 0 ? (
        <View testID="interval-preview" style={{ marginBottom: spacing.lg }}>
          <Text style={{ color: colors.muted, marginBottom: spacing.xs }}>
            If you study a topic today, you will revise it on:
          </Text>
          {preview.map(p => (
            <Text
              key={p.step}
              testID={`preview-${p.step}`}
              style={{ color: colors.text, paddingVertical: spacing.xs }}
            >
              {`Revision ${p.step}: ${p.date}`}
            </Text>
          ))}
        </View>
      ) : null}
      {error ? <ErrorRetry error={error} onRetry={next} /> : null}
      <Button title="Next" onPress={next} loading={saving} />
    </StepShell>
  );
}
