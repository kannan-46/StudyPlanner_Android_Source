import React from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from './ThemeProvider';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  error?: string;
  multiline?: boolean;
};

export function TextField({
  label,
  value,
  onChangeText,
  error,
  multiline,
  ...rest
}: TextFieldProps) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ color: colors.muted, marginBottom: spacing.xs }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...rest}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        style={{
          minHeight: multiline ? 96 : 48,
          color: colors.text,
          backgroundColor: colors.input,
          borderColor: error ? colors.danger : colors.line,
          borderWidth: 1,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          textAlignVertical: multiline ? 'top' : 'center',
          fontSize: 16,
        }}
      />
      {error ? (
        <Text style={{ color: colors.danger, marginTop: spacing.xs }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
