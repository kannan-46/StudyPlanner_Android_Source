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
}: {
  label: string;
  value: LocalDate;
  onChange: (d: LocalDate) => void;
  maximumDate?: LocalDate;
}) {
  const { colors, radius, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const handle = (e: DateTimePickerEvent, d?: Date) => {
    setOpen(Platform.OS === 'ios');
    if (e.type === 'set' && d) onChange(toLocalDate(d));
  };
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
        <Text style={{ color: colors.text, fontSize: 16 }}>
          {formatDate(value)}
        </Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={fromLocalDate(value)}
          mode="date"
          maximumDate={maximumDate ? fromLocalDate(maximumDate) : undefined}
          onChange={handle}
        />
      ) : null}
    </View>
  );
}
