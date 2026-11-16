import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTheme } from './ThemeProvider';

/**
 * - primary: filled accent, the main action.
 * - secondary: outlined, a second action.
 * - danger: filled red; only for the final confirm inside a dialog.
 * - dangerText: red text, no fill; for an inline Delete/Remove on a screen.
 * - text: accent text, no fill.
 */
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'dangerText'
  | 'text';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  disabledHint,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  /** Short line under a disabled button that says what is missing. */
  disabledHint?: string;
  /** Spoken name when the title alone is unclear (e.g. "Delete Mock A"). */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}) {
  const { colors, radius, spacing } = useTheme();
  const off = !!disabled || !!loading;
  // Disabled (not busy): neutral grey with muted text, so it never reads as
  // tappable. Loading keeps its colours, dimmed, with the spinner.
  const inactive = !!disabled && !loading;
  const filled = variant === 'primary' || variant === 'danger';
  const bg = !filled
    ? 'transparent'
    : inactive
    ? colors.line
    : variant === 'primary'
    ? colors.accent
    : colors.danger;
  const fg = inactive
    ? colors.muted
    : filled
    ? colors.accentText
    : variant === 'dangerText'
    ? colors.danger
    : colors.accent;
  const hint = inactive && disabledHint ? disabledHint : undefined;
  const button = (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      // Always named after its title, so TalkBack says "Save, busy" while it
      // spins instead of an unnamed button (and never keeps a stale "busy").
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: off, busy: !!loading }}
      accessibilityHint={hint ?? accessibilityHint}
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
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        opacity: loading ? 0.6 : 1,
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
  if (!hint) return button;
  return (
    <View style={{ gap: spacing.xs }}>
      {button}
      <Text style={{ color: colors.muted, textAlign: 'center' }}>{hint}</Text>
    </View>
  );
}
