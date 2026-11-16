import React, { useLayoutEffect, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { LocalDate, RevisionView } from '@planner/shared';
import type { RootStackParamList } from '../../app/RootNavigator';
import {
  ApiError,
  isSessionEndedError,
  userMessage,
} from '../../shared/api/errors';
import { formatDate } from '../../shared/lib/format';
import { useLocalToday } from '../../shared/lib/useLocalToday';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { Loading } from '../../shared/ui/Loading';
import { useResponsive } from '../../shared/ui/responsive';
import { Screen } from '../../shared/ui/Screen';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useRefetchOnFocus } from '../../shared/lib/useRefetchOnFocus';
import { useExams } from '../exams/hooks';
import { renderRevisionRow } from '../revisions/RevisionRow';
import { useSubjects } from '../subjects/hooks';
import { useDeleteTopic, useTopic } from './hooks';

/** Longest name the stack header shows in full (it is cut to 2 lines). */
export const HEADER_NAME_MAX = 40;

/**
 * Whether the stack header can carry the topic name. A longer name (or a
 * large font) would be cut off there, so the header says "Topic" and the
 * screen shows the full name as its heading instead.
 */
export function nameFitsHeader(name: string, fontScale: number): boolean {
  return name.length <= HEADER_NAME_MAX && fontScale < 1.3;
}

/** Minimal read-only row; Task 10 swaps in RevisionRow via renderRevision. */
export function ReadOnlyRevisionRow({
  revision,
  today,
}: {
  revision: RevisionView;
  today?: LocalDate;
}) {
  const { colors, spacing } = useTheme();
  const done = revision.doneOn !== null;
  const date = done
    ? `✓ ${formatDate(revision.doneOn as string, today)}`
    : formatDate(revision.dueOverride ?? revision.dueOn, today);
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
        Revision {revision.step}
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
  /** The topic is gone (deleted here, or found deleted): leave or close. */
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
  // Shows the copy from the topic list at once while the topic loads.
  const topicQ = useTopic(topicId, { fromList: true });
  const subjectsQ = useSubjects();
  const examsQ = useExams();
  const del = useDeleteTopic();
  const today = useLocalToday();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  useRefetchOnFocus(() => topicQ.refetch());

  const gone =
    topicQ.error instanceof ApiError && topicQ.error.code === 'NOT_FOUND';
  if (topicQ.isPending) {
    return <Loading />;
  }
  if (!topicQ.data || gone) {
    return (
      <View>
        <ErrorRetry
          error={topicQ.error}
          onRetry={() => topicQ.refetch()}
          context="topic"
        />
        {gone ? (
          <View style={{ alignItems: 'center' }}>
            <Button title="Go back" variant="secondary" onPress={onDeleted} />
          </View>
        ) : null}
      </View>
    );
  }
  const t = topicQ.data;
  const subject = subjectsQ.data?.find(s => s.id === t.subjectId)?.name;
  const exams = (examsQ.data ?? [])
    .filter(e => t.examIds.includes(e.id))
    .map(e => e.name);

  const openConfirm = () => {
    setDeleteError(null);
    setConfirmOpen(true);
  };
  const doDelete = async () => {
    setDeleteError(null);
    try {
      await del.mutateAsync(t.id);
      setConfirmOpen(false);
      onDeleted();
      // After the screen has gone, so the snackbar appears in its final place.
      const message = `${t.name} deleted`;
      setTimeout(() => snackbar.show({ message }), 0);
    } catch (e) {
      if (isSessionEndedError(e)) {
        setConfirmOpen(false);
        return;
      }
      setDeleteError(userMessage(e, 'topic'));
    }
  };

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
          Studied {formatDate(t.studiedOn, today)}
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
          renderRevision={
            renderRevision ?? renderRevisionRow(t.id, undefined, today)
          }
        />
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Button title="Edit" variant="secondary" onPress={onEdit} />
        <Button
          title="Delete"
          variant="dangerText"
          accessibilityLabel={`Delete ${t.name}`}
          onPress={openConfirm}
        />
      </View>
      <ConfirmDialog
        visible={confirmOpen}
        title="Delete topic?"
        message="This removes its revision history."
        confirmLabel="Delete"
        destructive
        busy={del.isPending}
        error={deleteError}
        onConfirm={doDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </View>
  );
}

export function TopicDetailScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'TopicDetail'>>();
  const { fontScale } = useResponsive();
  const name = useTopic(params.topicId, { fromList: true }).data?.name;
  const inHeader = !!name && nameFitsHeader(name, fontScale);
  useLayoutEffect(() => {
    navigation.setOptions({ title: inHeader && name ? name : 'Topic' });
  }, [navigation, name, inHeader]);
  return (
    <Screen scroll>
      <TopicDetailContent
        topicId={params.topicId}
        showName={!inHeader}
        onEdit={() =>
          navigation.navigate('TopicForm', { topicId: params.topicId })
        }
        onDeleted={() => navigation.goBack()}
      />
    </Screen>
  );
}
