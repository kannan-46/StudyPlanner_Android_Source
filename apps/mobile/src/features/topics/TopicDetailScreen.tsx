import React, { useLayoutEffect, type ReactNode } from 'react';
import { Alert, Text, View } from 'react-native';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RevisionView } from '@planner/shared';
import type { RootStackParamList } from '../../app/RootNavigator';
import { userMessage } from '../../shared/api/errors';
import { formatDate } from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { Loading } from '../../shared/ui/Loading';
import { Screen } from '../../shared/ui/Screen';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useRefetchOnFocus } from '../../shared/lib/useRefetchOnFocus';
import { useExams } from '../exams/hooks';
import { renderRevisionRow } from '../revisions/RevisionRow';
import { useSubjects } from '../subjects/hooks';
import { useDeleteTopic, useTopic } from './hooks';

/** Minimal read-only row; Task 10 swaps in RevisionRow via renderRevision. */
export function ReadOnlyRevisionRow({ revision }: { revision: RevisionView }) {
  const { colors, spacing } = useTheme();
  const done = revision.doneOn !== null;
  const date = done
    ? `✓ ${formatDate(revision.doneOn as string)}`
    : formatDate(revision.dueOverride ?? revision.dueOn);
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        minHeight: 48,
        alignItems: 'center',
        gap: spacing.sm,
      }}
    >
      <Text style={{ color: colors.text, fontWeight: '600' }}>
        R{revision.step}
      </Text>
      <Text style={{ color: done ? colors.success : colors.muted }}>
        {date}
      </Text>
    </View>
  );
}

export function RevisionTimeline({
  revisions,
  renderRevision,
}: {
  revisions: RevisionView[];
  renderRevision?: (r: RevisionView, all: RevisionView[]) => ReactNode;
}) {
  const sorted = [...revisions].sort((a, b) => a.step - b.step);
  return (
    <View>
      {sorted.map(r => (
        <View key={r.id}>
          {renderRevision ? (
            renderRevision(r, sorted)
          ) : (
            <ReadOnlyRevisionRow revision={r} />
          )}
        </View>
      ))}
    </View>
  );
}

export type TopicDetailContentProps = {
  topicId: string;
  onEdit: () => void;
  onDeleted: () => void;
  renderRevision?: (r: RevisionView, all: RevisionView[]) => ReactNode;
  /** False when a stack header already shows the topic name. */
  showName?: boolean;
};

/** Shared by the stack screen and the expanded master-detail pane. */
export function TopicDetailContent({
  topicId,
  onEdit,
  onDeleted,
  renderRevision,
  showName = true,
}: TopicDetailContentProps) {
  const { colors, spacing } = useTheme();
  const snackbar = useSnackbar();
  const topicQ = useTopic(topicId);
  const subjectsQ = useSubjects();
  const examsQ = useExams();
  const del = useDeleteTopic();
  useRefetchOnFocus(() => topicQ.refetch());

  if (topicQ.isPending) {
    return <Loading />;
  }
  if (!topicQ.data) {
    return <ErrorRetry error={topicQ.error} onRetry={() => topicQ.refetch()} />;
  }
  const t = topicQ.data;
  const subject = subjectsQ.data?.find(s => s.id === t.subjectId)?.name;
  const exams = (examsQ.data ?? [])
    .filter(e => t.examIds.includes(e.id))
    .map(e => e.name);

  const confirmDelete = () =>
    Alert.alert('Delete topic?', 'This removes its revision history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await del.mutateAsync(t.id);
            snackbar.show({ message: `${t.name} deleted` });
            onDeleted();
          } catch (e) {
            snackbar.show({ message: userMessage(e) });
          }
        },
      },
    ]);

  return (
    <View style={{ gap: spacing.md }}>
      <View>
        {showName ? (
          <Text
            accessibilityRole="header"
            style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}
          >
            {t.name}
          </Text>
        ) : null}
        <Text style={{ color: colors.muted }}>
          {[subject, ...exams].filter(Boolean).join(' · ')}
        </Text>
        <Text style={{ color: colors.muted }}>
          Studied {formatDate(t.studiedOn)}
        </Text>
      </View>
      {t.notes ? (
        <Card>
          <Text style={{ color: colors.text }}>{t.notes}</Text>
        </Card>
      ) : null}
      <Card>
        <Text style={{ color: colors.muted, marginBottom: spacing.xs }}>
          Revisions
        </Text>
        <RevisionTimeline
          revisions={t.revisions}
          renderRevision={renderRevision ?? renderRevisionRow(t.id)}
        />
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Button title="Edit" variant="secondary" onPress={onEdit} />
        <Button
          title="Delete"
          variant="danger"
          onPress={confirmDelete}
          loading={del.isPending}
        />
      </View>
    </View>
  );
}

export function TopicDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'TopicDetail'>>();
  const name = useTopic(params.topicId).data?.name;
  useLayoutEffect(() => {
    if (name) navigation.setOptions({ title: name });
  }, [navigation, name]);
  return (
    <Screen scroll>
      <TopicDetailContent
        topicId={params.topicId}
        showName={false}
        onEdit={() =>
          navigation.navigate('TopicForm', { topicId: params.topicId })
        }
        onDeleted={() => navigation.goBack()}
      />
    </Screen>
  );
}
