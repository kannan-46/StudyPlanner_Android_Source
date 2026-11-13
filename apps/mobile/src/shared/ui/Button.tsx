import React from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { useTheme } from './ThemeProvider';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'text';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
}) {
  const { colors, radius, spacing } = useTheme();
  const off = !!disabled || !!loading;
  const bg =
    variant === 'primary'
      ? colors.accent
      : variant === 'danger'
      ? colors.danger
      : 'transparent';
  const fg =
    variant === 'primary' || variant === 'danger'
      ? colors.accentText
      : colors.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      style={{
        minHeight: 48,
        minWidth: 48,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: bg,
        borderWidth: variant === 'secondary' ? 1 : 0,
        borderColor: colors.line,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        opacity: off ? 0.6 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator color={fg} testID="button-spinner" />
      ) : (
        <Text style={{ color: fg, fontWeight: '600', fontSize: 16 }}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
