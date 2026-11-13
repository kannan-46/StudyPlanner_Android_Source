import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
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
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const initial = (
    meQ.data?.settings?.intervals ?? DEFAULT_SETTINGS.intervals
  ).join(', ');
  const text = edited ?? initial;
  const parsed = parse(text);

  const preview = useMemo(() => {
    if (!parsed.value) return [];
    const today = localToday();
    return createSchedule(today, parsed.value, () => 'p').revisions.map(r => ({
      step: r.step,
      date: formatDate(r.dueOn, today),
    }));
  }, [parsed.value]);

  async function next() {
    if (!parsed.value) return;
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
        onChangeText={setEdited}
        error={parsed.error}
        keyboardType="numbers-and-punctuation"
      />
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
      <Button
        title="Next"
        onPress={next}
        loading={saving}
        disabled={!parsed.value}
      />
    </StepShell>
  );
}
