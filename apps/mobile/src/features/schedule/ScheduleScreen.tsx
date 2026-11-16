import React, { useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AgendaItem } from '@planner/shared';
import type { RootStackParamList } from '../../app/RootNavigator';
import { TAB_TITLES } from '../../app/tabTitles';
import { useLocalToday } from '../../shared/lib/useLocalToday';
import { useRefetchOnFocus } from '../../shared/lib/useRefetchOnFocus';
import { Card } from '../../shared/ui/Card';
import { ChipSelect } from '../../shared/ui/ChipSelect';
import { EmptyState } from '../../shared/ui/EmptyState';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { Loading } from '../../shared/ui/Loading';
import { useResponsive } from '../../shared/ui/responsive';
import { Screen } from '../../shared/ui/Screen';
import { ScreenTitle } from '../../shared/ui/ScreenTitle';
import { ScrollToTopOnTabPress } from '../../shared/ui/ScrollToTopOnTabPress';
import { SectionHeading } from '../../shared/ui/SectionHeading';
import { useTheme } from '../../shared/ui/ThemeProvider';
import {
  usePullToRefresh,
  type RefreshResult,
} from '../../shared/ui/usePullToRefresh';
import { AgendaRow } from '../agenda/AgendaRow';
import { useAgenda } from '../agenda/hooks';
import { useExams } from '../exams/hooks';
import { useTopics } from '../topics/hooks';
import { TopicDetailContent } from '../topics/TopicDetailScreen';
import {
  AGENDA_DAYS,
  EMPTY_TEXT,
  laterRevisionText,
  nextRevision,
} from './agendaText';

const SECTIONS: { bucket: AgendaItem['bucket']; title: string }[] = [
  { bucket: 'overdue', title: 'Overdue' },
  { bucket: 'today', title: 'Today' },
  { bucket: 'upcoming', title: EMPTY_TEXT.upcomingSection },
];

type Section = { title: string; data: AgendaItem[] };

/** A refresh failure is worth a snackbar whenever older data stays shown. */
const reportRefresh = (r: RefreshResult) => r.isError && r.data !== undefined;

export function ScheduleScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, spacing } = useTheme();
  const { size } = useResponsive();
  const expanded = size === 'expanded';

  const today = useLocalToday();
  const agendaQ = useAgenda(AGENDA_DAYS, today);
  const examsQ = useExams();
  // Every topic (shared with Home): the empty state tells "no topics yet"
  // apart from "every topic fully revised".
  const topicsQ = useTopics();
  const listRef = useRef<SectionList<AgendaItem, Section>>(null);
  useRefetchOnFocus(
    () => agendaQ.refetch(),
    () => topicsQ.refetch(),
  );

  const [examId, setExamId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { refreshing, onRefresh } = usePullToRefresh(
    () => Promise.all([agendaQ.refetch(), topicsQ.refetch()]),
    { shouldReport: reportRefresh },
  );

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

  const exams = examsQ.data ?? [];
  const examName = exams.find(e => e.id === examId)?.name;
  const hiddenByFilter = examId !== '' && (agendaQ.data?.length ?? 0) > 0;
  const allTopics = topicsQ.data;
  const activeTopics = (allTopics ?? []).filter(
    t => t.status === 'active' && (!examId || t.examIds.includes(examId)),
  );
  // Nothing in the agenda's range: the next revision further away, if any.
  const later = nextRevision([], activeTopics, today);
  const addTopic = () => navigation.navigate('TopicForm');
  const header = (
    <View style={{ marginBottom: spacing.sm }}>
      <ScreenTitle>{TAB_TITLES.Schedule}</ScreenTitle>
      {exams.length > 0 ? (
        <ChipSelect
          scroll
          groupLabel="Exam filter"
          options={[
            { value: '', label: 'All exams' },
            ...exams.map(e => ({ value: e.id, label: e.name })),
          ]}
          value={examId}
          onChange={v => setExamId(v as string)}
        />
      ) : null}
    </View>
  );

  const emptyList = () => {
    if (agendaQ.isPending) return <Loading />;
    if (agendaQ.error && !agendaQ.data) {
      return (
        <ErrorRetry error={agendaQ.error} onRetry={() => agendaQ.refetch()} />
      );
    }
    // The empty state depends on the topics ("no topics yet", "all revised",
    // the next revision): wait for them rather than flash a generic message.
    if (topicsQ.isPending) return <Loading />;
    if (topicsQ.error && !topicsQ.data) {
      return (
        <ErrorRetry error={topicsQ.error} onRetry={() => topicsQ.refetch()} />
      );
    }
    if (hiddenByFilter) {
      return (
        <EmptyState
          title={`Nothing due for ${examName ?? 'this exam'}`}
          body="Revisions for your other exams are under All exams."
          actionLabel="Show all exams"
          onAction={() => setExamId('')}
        />
      );
    }
    if (later) {
      return (
        <EmptyState
          title={EMPTY_TEXT.nothingDue}
          body={laterRevisionText(later, today)}
        />
      );
    }
    if (allTopics && allTopics.length === 0) {
      return (
        <EmptyState
          title={EMPTY_TEXT.noTopics.title}
          body={EMPTY_TEXT.noTopics.body}
          actionLabel={EMPTY_TEXT.noTopics.action}
          onAction={addTopic}
        />
      );
    }
    if (!examId && allTopics && !allTopics.some(t => t.status === 'active')) {
      return (
        <EmptyState
          title={EMPTY_TEXT.allRevised.title}
          body={EMPTY_TEXT.allRevised.body}
          actionLabel={EMPTY_TEXT.allRevised.action}
          onAction={addTopic}
        />
      );
    }
    return <EmptyState title={EMPTY_TEXT.nothingDue} />;
  };

  const list = (
    <SectionList
      ref={listRef}
      testID="schedule-list"
      sections={sections}
      keyExtractor={i => `${i.topicId}:${i.revisionId}`}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{
        padding: spacing.lg,
        paddingBottom: spacing.xxl,
      }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.accent]}
          tintColor={colors.accent}
          progressBackgroundColor={colors.surface}
        />
      }
      ListHeaderComponent={header}
      ListEmptyComponent={emptyList()}
      renderSectionHeader={({ section }) => (
        <SectionHeading style={{ marginTop: spacing.md }}>
          {section.title}
        </SectionHeading>
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

  const scrollToTop = <ScrollToTopOnTabPress scrollRef={listRef} />;

  if (!expanded) {
    return (
      <Screen fullWidth>
        {scrollToTop}
        {list}
      </Screen>
    );
  }

  return (
    <Screen fullWidth>
      {scrollToTop}
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
