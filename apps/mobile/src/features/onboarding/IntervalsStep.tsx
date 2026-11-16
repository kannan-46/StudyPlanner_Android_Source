import React, { useMemo, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  DEFAULT_SETTINGS,
  createSchedule,
  daysBetween,
  localToday,
} from '@planner/shared';
import { Button } from '../../shared/ui/Button';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { TextField } from '../../shared/ui/TextField';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { formatDate } from '../../shared/lib/format';
import { useMe, useUpdateMe } from '../me/hooks';
import {
  INTERVALS_HINT,
  INTERVALS_LABEL,
  parseIntervalsText,
} from './intervalsText';
import { StepShell } from './StepShell';

export const INTERVALS_TITLE = 'When to revise';

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

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
  const parsed = parseIntervalsText(text);

  // While typing, keep showing the last valid preview instead of blanking it.
  const lastValid = useRef<number[] | undefined>(undefined);
  if (parsed.value) lastValid.current = parsed.value;
  const shown = parsed.value ?? (touched ? undefined : lastValid.current);
  const preview = useMemo(() => {
    if (!shown) return [];
    const today = localToday();
    let prev = today;
    return createSchedule(today, shown, () => 'p').revisions.map(r => {
      // The real gap from the step before, so "4, 7" reads as day 4 and
      // day 7 after studying (3 days apart), not 4 then 7 more days.
      const gap = daysBetween(prev, r.dueOn);
      const after =
        r.step === 1
          ? `${days(gap)} after studying`
          : `${days(gap)} after revision ${r.step - 1}`;
      prev = r.dueOn;
      return { step: r.step, date: formatDate(r.dueOn, today), after };
    });
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
    <StepShell step={2} title={INTERVALS_TITLE}>
      <Text style={{ color: colors.text, marginBottom: spacing.lg }}>
        Enter the days after studying when you want to revise. 4, 7, 15 means
        day 4, day 7 and day 15 after you study a topic. If you revise late, the
        later revisions move forward.
      </Text>
      <TextField
        label={INTERVALS_LABEL}
        value={text}
        onChangeText={t => {
          setEdited(t);
          setTouched(false);
        }}
        onBlur={() => setTouched(true)}
        error={touched ? parsed.error : undefined}
        // A number keyboard; dots, dashes and spaces work as separators too.
        keyboardType={
          Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'
        }
      />
      <Text style={{ color: colors.muted, marginBottom: spacing.md }}>
        {INTERVALS_HINT}
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
              {`Revision ${p.step}: ${p.date} `}
              <Text style={{ color: colors.muted }}>{`(${p.after})`}</Text>
            </Text>
          ))}
        </View>
      ) : null}
      {error ? <ErrorRetry error={error} onRetry={next} /> : null}
      <Button title="Next" onPress={next} loading={saving} />
    </StepShell>
  );
}
