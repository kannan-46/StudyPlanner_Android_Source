import React from 'react';
import { ActivityIndicator } from 'react-native';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TopicView } from '@planner/shared';
import type { RootStackParamList } from '../../app/RootNavigator';
import { formatDate } from '../../shared/lib/format';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { Screen } from '../../shared/ui/Screen';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useTopic } from './hooks';
import { TopicForm } from './TopicForm';

function EditLoader({
  topicId,
  onSaved,
}: {
  topicId: string;
  onSaved: (t: TopicView) => void;
}) {
  const { colors } = useTheme();
  const topicQ = useTopic(topicId);
  if (topicQ.data) {
    return <TopicForm mode="edit" initial={topicQ.data} onSaved={onSaved} />;
  }
  if (topicQ.isPending) {
    return (
      <ActivityIndicator color={colors.accent} accessibilityLabel="Loading" />
    );
  }
  return <ErrorRetry error={topicQ.error} onRetry={() => topicQ.refetch()} />;
}

export function TopicFormScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'TopicForm'>>();
  const topicId = route.params?.topicId;
  const snackbar = useSnackbar();

  const onSaved = (t: TopicView) => {
    snackbar.show({
      message: topicId
        ? 'Saved'
        : `${t.name} added — first revision ${
            t.nextDueOn ? formatDate(t.nextDueOn) : 'scheduled'
          }`,
    });
    navigation.goBack();
  };

  return (
    <Screen scroll>
      {topicId ? (
        <EditLoader topicId={topicId} onSaved={onSaved} />
      ) : (
        <TopicForm mode="create" onSaved={onSaved} />
      )}
    </Screen>
  );
}
