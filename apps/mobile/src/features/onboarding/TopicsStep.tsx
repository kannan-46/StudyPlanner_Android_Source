import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../shared/ui/Button';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useAuth } from '../auth/AuthProvider';
import { useUpdateMe } from '../me/hooks';
import { TopicForm } from '../topics/TopicForm';
import { StepShell } from './StepShell';

export function TopicsStep() {
  const { colors, spacing } = useTheme();
  const { refreshUser } = useAuth();
  const updateMe = useUpdateMe();
  const [added, setAdded] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [finishing, setFinishing] = useState(false);

  async function complete() {
    setError(null);
    setFinishing(true);
    try {
      await updateMe.mutateAsync({ onboardingCompleted: true });
      await refreshUser();
    } catch (e) {
      setError(e);
    } finally {
      setFinishing(false);
    }
  }

  return (
    <StepShell step={4} title="Add your first topics">
      <Text
        style={{
          color: colors.text,
          fontWeight: '600',
          marginBottom: spacing.md,
        }}
      >
        {`Added: ${added} ${added === 1 ? 'topic' : 'topics'}`}
      </Text>
      <TopicForm
        mode="create"
        compact
        clearNameOnSave
        submitLabel="Add another"
        onSaved={() => setAdded(n => n + 1)}
      />
      {error ? <ErrorRetry error={error} onRetry={complete} /> : null}
      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        <Button
          title="Finish"
          onPress={complete}
          loading={finishing}
          disabled={added < 1}
        />
        <Button
          title="Skip for now"
          variant="text"
          onPress={complete}
          disabled={finishing}
        />
      </View>
    </StepShell>
  );
}
