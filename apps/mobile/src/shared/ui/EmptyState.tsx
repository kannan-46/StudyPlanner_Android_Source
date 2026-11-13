import React from 'react';
import { Text, View } from 'react-native';
import { Button } from './Button';
import { useTheme } from './ThemeProvider';

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{ alignItems: 'center', padding: spacing.xl, gap: spacing.sm }}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: 18,
          fontWeight: '700',
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {body ? (
        <Text style={{ color: colors.muted, textAlign: 'center' }}>{body}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} />
      ) : null}
    </View>
  );
}
