import React from 'react';
import { Text, View } from 'react-native';
import { userMessage } from '../api/errors';
import { useAnnounce } from './announce';
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
  const message = userMessage(error);
  // Shown in place of content that failed to load; say it, since focus
  // does not move to it.
  useAnnounce(message);
  return (
    <View
      style={{ alignItems: 'center', padding: spacing.xl, gap: spacing.md }}
    >
      <Text style={{ color: colors.danger, textAlign: 'center' }}>
        {message}
      </Text>
      <Button title="Retry" variant="secondary" onPress={onRetry} />
    </View>
  );
}
