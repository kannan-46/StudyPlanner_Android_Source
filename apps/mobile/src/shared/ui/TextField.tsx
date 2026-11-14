import React from 'react';
import {
  Text,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
} from 'react-native';
import { useTheme } from './ThemeProvider';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  /** The input itself, e.g. to focus the first invalid field. */
  ref?: React.Ref<TextInputInstance>;
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
  ref,
  ...rest
}: TextFieldProps) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ color: colors.muted, marginBottom: spacing.xs }}>
        {label}
      </Text>
      <TextInput
        ref={ref}
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
