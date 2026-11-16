import React, { useState } from 'react';
import { View } from 'react-native';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { daysBetween, localToday, type TopicView } from '@planner/shared';
import type { RootStackParamList } from '../../app/RootNavigator';
import { ApiError } from '../../shared/api/errors';
import { onDayLabel } from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { Loading } from '../../shared/ui/Loading';
import { Screen } from '../../shared/ui/Screen';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useLeaveGuard } from '../../shared/ui/useLeaveGuard';
import { shortName } from '../onboarding/messages';
import { useTopic } from './hooks';
import { TopicForm } from './TopicForm';

/**
 * The snackbar after adding a topic: "Hernia added — first revision on 20 Nov".
 * A topic studied weeks ago is due straight away, so a past date reads "is
 * due now", never as if it were still coming up.
 */
export function addedMessage(t: TopicView, today = localToday()): string {
  const due = t.nextDueOn;
  let when = 'scheduled';
  if (due) {
    const n = daysBetween(today, due);
    if (n < 0) when = 'is due now';
    else if (n === 0) when = 'is due today';
    else when = onDayLabel(due, today);
  }
  return `${shortName(t.name)} added — first revision ${when}`;
}

function EditLoader({
  topicId,
  onSaved,
  onDirtyChange,
  onSavingChange,
}: {
  topicId: string;
  onSaved: (t: TopicView) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const navigation = useNavigation();
  const topicQ = useTopic(topicId);
  if (topicQ.data) {
    return (
      <TopicForm
        mode="edit"
        initial={topicQ.data}
        onSaved={onSaved}
        onDirtyChange={onDirtyChange}
        onSavingChange={onSavingChange}
      />
    );
  }
  if (topicQ.isPending) {
    return <Loading />;
  }
  const gone =
    topicQ.error instanceof ApiError && topicQ.error.code === 'NOT_FOUND';
  return (
    <View>
      <ErrorRetry
        error={topicQ.error}
        onRetry={() => topicQ.refetch()}
        context="topic"
      />
      {gone ? (
        <Button
          title="Go back"
          variant="secondary"
          onPress={() => navigation.goBack()}
        />
      ) : null}
    </View>
  );
}

export function TopicFormScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'TopicForm'>>();
  const params = route.params;
  const topicId = params?.topicId;
  const examId = params?.examId;
  const snackbar = useSnackbar();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const guard = useLeaveGuard(dirty, saving);

  const onSaved = (t: TopicView) => {
    const message = topicId ? 'Saved' : addedMessage(t);
    // Shown once the screen has gone, in its final place above the tab bar.
    guard.leaveAfterSave(() => snackbar.show({ message }));
  };

  return (
    <Screen scroll>
      {topicId ? (
        <EditLoader
          topicId={topicId}
          onSaved={onSaved}
          onDirtyChange={setDirty}
          onSavingChange={setSaving}
        />
      ) : (
        <TopicForm
          mode="create"
          onSaved={onSaved}
          onDirtyChange={setDirty}
          onSavingChange={setSaving}
          defaultExamIds={examId ? [examId] : undefined}
        />
      )}
      {guard.dialog}
    </Screen>
  );
}
