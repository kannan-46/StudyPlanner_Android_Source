import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  SectionList,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AgendaItem } from '@planner/shared';
import type { RootStackParamList } from '../../app/RootNavigator';
import { useLocalToday } from '../../shared/lib/useLocalToday';
import { useRefetchOnFocus } from '../../shared/lib/useRefetchOnFocus';
import { Card } from '../../shared/ui/Card';
import { ChipSelect } from '../../shared/ui/ChipSelect';
import { EmptyState } from '../../shared/ui/EmptyState';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { useResponsive } from '../../shared/ui/responsive';
import { Screen } from '../../shared/ui/Screen';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { AgendaRow } from '../agenda/AgendaRow';
import { useAgenda } from '../agenda/hooks';
import { useExams } from '../exams/hooks';
import { useTopics } from '../topics/hooks';
import { TopicDetailContent } from '../topics/TopicDetailScreen';

const SECTIONS: { bucket: AgendaItem['bucket']; title: string }[] = [
  { bucket: 'overdue', title: 'Overdue' },
  { bucket: 'today', title: 'Today' },
  { bucket: 'upcoming', title: 'Upcoming' },
];

export function ScheduleScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, spacing } = useTheme();
  const { size } = useResponsive();
  const expanded = size === 'expanded';

  const today = useLocalToday();
  const agendaQ = useAgenda(30, today);
  const examsQ = useExams();
  const topicsQ = useTopics({ status: 'active' });
  useRefetchOnFocus(
    () => agendaQ.refetch(),
    () => topicsQ.refetch(),
  );

  const [examId, setExamId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const sections = useMemo(() => {
    const examsByTopic = new Map(
      (topicsQ.data ?? []).map(t => [t.id, t.examIds]),
    );
    const items = (agendaQ.data ?? []).filter(
      i =>
        !examId ||
        !examsByTopic.has(i.topicId) ||
        (examsByTopic.get(i.topicId) ?? []).includes(examId),
    );
    return SECTIONS.map(s => ({
      title: s.title,
      data: items.filter(i => i.bucket === s.bucket),
    })).filter(s => s.data.length > 0);
  }, [agendaQ.data, topicsQ.data, examId]);

  const open = (topicId: string) => {
    if (expanded) setSelectedId(topicId);
    else navigation.navigate('TopicDetail', { topicId });
  };
  const refresh = async () => {
    setRefreshing(true);
    try {
      await agendaQ.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const exams = examsQ.data ?? [];
  const examName = exams.find(e => e.id === examId)?.name;
  const hiddenByFilter = examId !== '' && (agendaQ.data?.length ?? 0) > 0;
  const header =
    exams.length > 0 ? (
      <View style={{ marginBottom: spacing.sm }}>
        <ChipSelect
          options={[
            { value: '', label: 'All' },
            ...exams.map(e => ({ value: e.id, label: e.name })),
          ]}
          value={examId}
          onChange={v => setExamId(v as string)}
        />
      </View>
    ) : undefined;

  const list = (
    <SectionList
      sections={sections}
      keyExtractor={i => `${i.topicId}:${i.revisionId}`}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{
        padding: spacing.lg,
        paddingBottom: spacing.xxl,
      }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
      ListHeaderComponent={header}
      ListEmptyComponent={
        agendaQ.isPending ? (
          <ActivityIndicator
            color={colors.accent}
            accessibilityLabel="Loading"
            style={{ marginTop: spacing.xl }}
          />
        ) : agendaQ.error && !agendaQ.data ? (
          <ErrorRetry error={agendaQ.error} onRetry={() => agendaQ.refetch()} />
        ) : hiddenByFilter ? (
          <EmptyState
            title={`Nothing due for ${examName ?? 'this exam'}`}
            body="Revisions for your other exams are under All."
            actionLabel="Show all"
            onAction={() => setExamId('')}
          />
        ) : (
          <EmptyState title="Nothing due — add topics or enjoy the break" />
        )
      }
      renderSectionHeader={({ section }) => (
        <Text
          accessibilityRole="header"
          style={{
            color: colors.muted,
            fontWeight: '700',
            marginTop: spacing.md,
            marginBottom: spacing.xs,
          }}
        >
          {section.title}
        </Text>
      )}
      extraData={selectedId}
      renderItem={({ item }) => {
        const selected = expanded && item.topicId === selectedId;
        return (
          <View
            testID={`schedule-row-${item.topicId}`}
            accessibilityState={expanded ? { selected } : undefined}
          >
            <Card
              style={[
                { marginBottom: spacing.sm, paddingVertical: spacing.sm },
                // Tablet: the open topic is highlighted; every row keeps the
                // same border width so nothing shifts when it changes.
                expanded && {
                  borderWidth: 2,
                  borderColor: selected ? colors.accent : colors.line,
                  backgroundColor: selected
                    ? colors.softAccent
                    : colors.surface,
                },
              ]}
            >
              <AgendaRow item={item} onOpenTopic={open} today={today} />
            </Card>
          </View>
        );
      }}
    />
  );

  if (!expanded) return <Screen fullWidth>{list}</Screen>;

  return (
    <Screen fullWidth>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View
          style={{
            flex: 2,
            borderRightWidth: 1,
            borderRightColor: colors.line,
          }}
        >
          {list}
        </View>
        <View style={{ flex: 3 }}>
          {selectedId ? (
            <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
              <TopicDetailContent
                key={selectedId}
                topicId={selectedId}
                onEdit={() =>
                  navigation.navigate('TopicForm', { topicId: selectedId })
                }
                onDeleted={() => setSelectedId(null)}
              />
            </ScrollView>
          ) : (
            <EmptyState title="Select a topic" />
          )}
        </View>
      </View>
    </Screen>
  );
}
