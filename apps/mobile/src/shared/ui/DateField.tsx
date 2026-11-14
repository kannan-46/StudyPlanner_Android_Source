import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import type { LocalDate } from '@planner/shared';
import { formatDate } from '../lib/format';
import { useTheme } from './ThemeProvider';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date fields only; never toISOString. */
export function toLocalDate(d: Date): LocalDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromLocalDate(v: LocalDate): Date {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function DateField({
  label,
  value,
  onChange,
  maximumDate,
  minimumDate,
  emptyText = 'No date set',
}: {
  label: string;
  /** null shows emptyText; the picker then opens on today (or the minimum). */
  value: LocalDate | null;
  onChange: (d: LocalDate) => void;
  maximumDate?: LocalDate;
  minimumDate?: LocalDate;
  emptyText?: string;
}) {
  const { colors, radius, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const handle = (e: DateTimePickerEvent, d?: Date) => {
    setOpen(Platform.OS === 'ios');
    if (e.type !== 'set' || !d) return;
    const picked = toLocalDate(d);
    if (minimumDate && picked < minimumDate) return;
    onChange(picked);
  };
  let start = value ?? toLocalDate(new Date());
  if (minimumDate && start < minimumDate) start = minimumDate;
  if (maximumDate && start > maximumDate) start = maximumDate;
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ color: colors.muted, marginBottom: spacing.xs }}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        style={{
          minHeight: 48,
          justifyContent: 'center',
          paddingHorizontal: spacing.md,
          backgroundColor: colors.input,
          borderColor: colors.line,
          borderWidth: 1,
          borderRadius: radius.md,
        }}
      >
        <Text
          style={{ color: value ? colors.text : colors.muted, fontSize: 16 }}
        >
          {value ? formatDate(value) : emptyText}
        </Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={fromLocalDate(start)}
          mode="date"
          maximumDate={maximumDate ? fromLocalDate(maximumDate) : undefined}
          minimumDate={minimumDate ? fromLocalDate(minimumDate) : undefined}
          onChange={handle}
        />
      ) : null}
    </View>
  );
}
