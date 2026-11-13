import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from './ThemeProvider';

export function ChipSelect<T extends string | number>({
  options,
  value,
  onChange,
  multiple,
}: {
  options: { value: T; label: string }[];
  value: T[] | T;
  onChange: (v: T[] | T) => void;
  multiple?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();
  const selected = Array.isArray(value) ? value : [value];
  const toggle = (v: T) => {
    if (multiple) {
      onChange(
        selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v],
      );
    } else {
      onChange(Array.isArray(value) ? [v] : v);
    }
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {options.map(o => {
        const on = selected.includes(o.value);
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityState={{ selected: on, checked: on }}
            onPress={() => toggle(o.value)}
            style={{
              minHeight: 48,
              minWidth: 48,
              paddingHorizontal: spacing.lg,
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: on ? colors.accent : colors.line,
              backgroundColor: on ? colors.softAccent : colors.surface,
            }}
          >
            <Text style={{ color: on ? colors.accent : colors.text }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
