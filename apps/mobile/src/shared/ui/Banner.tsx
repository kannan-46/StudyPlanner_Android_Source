import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from './ThemeProvider';

export function Banner({
  tone,
  text,
  actionLabel,
  onAction,
}: {
  tone: 'info' | 'warning' | 'error';
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const c =
    tone === 'error'
      ? colors.danger
      : tone === 'warning'
      ? colors.muted
      : colors.accent;
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: c,
        backgroundColor: colors.softAccent,
        borderRadius: radius.md,
        paddingLeft: spacing.md,
        minHeight: 48,
      }}
    >
      <Text
        style={{
          color: colors.text,
          flexShrink: 1,
          paddingVertical: spacing.sm,
        }}
      >
        {text}
      </Text>
      {actionLabel ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={{
            minHeight: 48,
            minWidth: 48,
            paddingHorizontal: spacing.md,
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: c, fontWeight: '700' }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
