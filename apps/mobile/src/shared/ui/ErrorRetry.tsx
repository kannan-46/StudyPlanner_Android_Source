import React from 'react';
import { Text, View } from 'react-native';
import { userMessage } from '../api/errors';
import { Button } from './Button';
import { useTheme } from './ThemeProvider';

export function ErrorRetry({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={{ alignItems: 'center', padding: spacing.xl, gap: spacing.md }}
    >
      <Text style={{ color: colors.danger, textAlign: 'center' }}>
        {userMessage(error)}
      </Text>
      <Button title="Retry" variant="secondary" onPress={onRetry} />
    </View>
  );
}
