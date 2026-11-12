import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {DateTimePickerAndroid} from '@react-native-community/datetimepicker';
import {localDateString} from '../planner/revisions';
import type {Theme} from './theme';

export function PickerField({
  theme,
  label,
  value,
  mode,
  onChange,
}: {
  theme: Theme;
  label: string;
  value: string;
  mode: 'date' | 'time';
  onChange: (value: string) => void;
}) {
  const openPicker = () => {
    const selected = mode === 'date' ? dateFromIso(value) : timeAsDate(value);
    DateTimePickerAndroid.open({
      value: selected,
      mode,
      is24Hour: true,
      onValueChange: (_event, nextDate) => {
        if (!nextDate) return;
        if (mode === 'date') {
          onChange(localDateString(nextDate));
        } else {
          onChange(`${String(nextDate.getHours()).padStart(2, '0')}:${String(nextDate.getMinutes()).padStart(2, '0')}`);
        }
      },
    });
  };

  return (
    <View style={styles.field}>
      <Text style={[styles.label, {color: theme.text}]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value}`}
        onPress={openPicker}
        style={({pressed}) => [
          styles.input,
          {backgroundColor: theme.input, borderColor: theme.line, opacity: pressed ? 0.8 : 1},
        ]}>
        <Text style={{color: theme.text, fontSize: 15}}>{value}</Text>
        <Text style={{color: theme.accent, fontSize: 17}}>{mode === 'date' ? '▦' : '◷'}</Text>
      </Pressable>
    </View>
  );
}

function dateFromIso(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year || new Date().getFullYear(), Math.max(0, (month || 1) - 1), day || 1, 12, 0, 0);
}

function timeAsDate(value: string): Date {
  const [hour, minute] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(hour || 0, minute || 0, 0, 0);
  return date;
}

const styles = StyleSheet.create({
  field: {gap: 7, marginBottom: 2},
  label: {fontSize: 13, fontWeight: '700'},
  input: {minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
});
