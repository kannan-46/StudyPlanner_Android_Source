import React, { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { TopicView } from '@planner/shared';
import type { RootStackParamList } from '../../app/RootNavigator';
import { formatDate } from '../../shared/lib/format';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { Screen } from '../../shared/ui/Screen';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useLeaveGuard } from '../../shared/ui/useLeaveGuard';
import { useTopic } from './hooks';
import { TopicForm } from './TopicForm';

function EditLoader({
  topicId,
  onSaved,
  onDirtyChange,
}: {
  topicId: string;
  onSaved: (t: TopicView) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { colors } = useTheme();
  const topicQ = useTopic(topicId);
  if (topicQ.data) {
    return (
      <TopicForm
        mode="edit"
        initial={topicQ.data}
        onSaved={onSaved}
        onDirtyChange={onDirtyChange}
      />
    );
  }
  if (topicQ.isPending) {
    return (
      <ActivityIndicator color={colors.accent} accessibilityLabel="Loading" />
    );
  }
  return <ErrorRetry error={topicQ.error} onRetry={() => topicQ.refetch()} />;
}

export function TopicFormScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'TopicForm'>>();
  const topicId = route.params?.topicId;
  const snackbar = useSnackbar();
  const [dirty, setDirty] = useState(false);
  const guard = useLeaveGuard(dirty);

  const onSaved = (t: TopicView) => {
    snackbar.show({
      message: topicId
        ? 'Saved'
        : `${t.name} added — first revision ${
            t.nextDueOn ? formatDate(t.nextDueOn) : 'scheduled'
          }`,
    });
    guard.leaveAfterSave();
  };

  return (
    <Screen scroll>
      {topicId ? (
        <EditLoader
          topicId={topicId}
          onSaved={onSaved}
          onDirtyChange={setDirty}
        />
      ) : (
        <TopicForm mode="create" onSaved={onSaved} onDirtyChange={setDirty} />
      )}
      {guard.dialog}
    </Screen>
  );
}
