import React from 'react';
import { Text, View } from 'react-native';
import { canRetry, userMessage, type MessageContext } from '../api/errors';
import { useAnnounce } from './announce';
import { Button } from './Button';
import { useTheme } from './ThemeProvider';

/**
 * A failed load or save, with a Retry button when trying again can help
 * (connection problems, server hiccups). A deleted item or a full list gets
 * the message alone. `context` names the item in the message.
 */
export function ErrorRetry({
  error,
  onRetry,
  context,
}: {
  error: unknown;
  onRetry: () => void;
  context?: MessageContext;
}) {
  const { colors, spacing } = useTheme();
  const message = userMessage(error, context);
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
      {canRetry(error) ? (
        <Button title="Retry" variant="secondary" onPress={onRetry} />
      ) : null}
    </View>
  );
}
