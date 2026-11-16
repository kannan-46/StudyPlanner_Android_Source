import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  NavigationRouteContext,
  useNavigation,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { LocalDate, TopicListQuery, TopicView } from '@planner/shared';
import type { MainTabParamList } from '../../app/MainTabs';
import type { RootStackParamList } from '../../app/RootNavigator';
import { TAB_TITLES } from '../../app/tabTitles';
import { dueStatus } from '../../shared/lib/format';
import { useLocalToday } from '../../shared/lib/useLocalToday';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { ChipSelect } from '../../shared/ui/ChipSelect';
import { DueText } from '../../shared/ui/DueText';
import { EmptyState } from '../../shared/ui/EmptyState';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { Loading } from '../../shared/ui/Loading';
import { columnsFor, useResponsive } from '../../shared/ui/responsive';
import { Screen } from '../../shared/ui/Screen';
import { ScreenTitle } from '../../shared/ui/ScreenTitle';
import { ScrollToTopOnTabPress } from '../../shared/ui/ScrollToTopOnTabPress';
import { useSnackbarInsetWhileFocused } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { usePullToRefresh } from '../../shared/ui/usePullToRefresh';
import { useExams } from '../exams/hooks';
import { useSubjects } from '../subjects/hooks';
import { useRefetchOnFocus } from '../../shared/lib/useRefetchOnFocus';
import { useTopics } from './hooks';
import { TopicDetailContent } from './TopicDetailScreen';
import { useScreenReaderEnabled } from './useScreenReaderEnabled';

type Status = 'active' | 'completed' | 'all';

const FAB_HEIGHT = 48;

/** "1 of 6 done", or "All 6 done" once every revision is done. */
export function progressLabel(t: TopicView): string {
  const total = t.revisions.length;
  const done = t.revisions.filter(r => r.doneOn !== null).length;
  return total > 0 && done === total
    ? `All ${total} done`
    : `${done} of ${total} done`;
}

/** What TalkBack reads for a row, in plain words. */
export function topicRowLabel(
  topic: TopicView,
  subject: string | undefined,
  today: LocalDate,
): string {
  const due = topic.nextDueOn
    ? dueStatus(topic.nextDueOn, today).text
    : topic.status === 'completed'
    ? 'Completed'
    : undefined;
  return [topic.name, subject, due, progressLabel(topic)]
    .filter(Boolean)
    .join(', ');
}

function TopicRow({
  topic,
  subject,
  today,
  selected,
  dimmed,
  onPress,
}: {
  topic: TopicView;
  subject?: string;
  today: LocalDate;
  /** Tablet split view: this topic is open in the detail pane. */
  selected?: boolean;
  /** A new search or filter is loading; this row may be about to change. */
  dimmed: boolean;
  onPress: () => void;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={topicRowLabel(topic, subject, today)}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={{ flex: 1, minHeight: 48, opacity: dimmed ? 0.6 : 1 }}
    >
      <Card
        style={{
          borderColor: selected ? colors.accent : colors.line,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: spacing.sm,
        }}
      >
        {/* flex: 1 keeps the status on the right whatever the name's length;
            a long name wraps inside its own column. */}
        <View style={{ flex: 1, minWidth: 120 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>
            {topic.name}
          </Text>
          {subject ? (
            <Text style={{ color: colors.muted }}>{subject}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', marginLeft: 'auto' }}>
          {topic.nextDueOn ? (
            <DueText due={topic.nextDueOn} today={today} />
          ) : (
            <Text style={{ color: colors.text }}>
              {topic.status === 'completed' ? 'Completed' : '—'}
            </Text>
          )}
          <Text style={{ color: colors.muted }}>{progressLabel(topic)}</Text>
        </View>
      </Card>
    </Pressable>
  );
}

export function TopicsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, radius, spacing } = useTheme();
  const { size } = useResponsive();
  const expanded = size === 'expanded';
  const screenReader = useScreenReaderEnabled();
  const listRef = useRef<FlatList<TopicView>>(null);

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [examId, setExamId] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Opened from Progress or "Show topics" with a subject (or exam): show all
  // of its topics, completed ones too, then drop the params so a later filter
  // change by hand is not undone.
  // Read without useRoute so the screen also renders outside a navigator.
  const route = useContext(NavigationRouteContext) as
    | RouteProp<MainTabParamList, 'Topics'>
    | undefined;
  const paramSubjectId = route?.params?.subjectId;
  const paramExamId = route?.params?.examId;
  useEffect(() => {
    if (!paramSubjectId && !paramExamId) return;
    setSearch('');
    setQ('');
    setSubjectId(paramSubjectId ?? '');
    setExamId(paramExamId ?? '');
    setStatus('all');
    navigation.setParams({
      subjectId: undefined,
      examId: undefined,
    } as never);
  }, [paramSubjectId, paramExamId, navigation]);

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const subjectsQ = useSubjects();
  const examsQ = useExams();
  // A filter on a subject or exam that has since been deleted (or replaced by
  // a backup restore) is dropped, so it can never hide every topic.
  const activeSubjectId =
    subjectId && subjectsQ.data && !subjectsQ.data.some(s => s.id === subjectId)
      ? ''
      : subjectId;
  const activeExamId =
    examId && examsQ.data && !examsQ.data.some(e => e.id === examId)
      ? ''
      : examId;
  useEffect(() => {
    if (subjectId && !activeSubjectId) setSubjectId('');
  }, [subjectId, activeSubjectId]);
  useEffect(() => {
    if (examId && !activeExamId) setExamId('');
  }, [examId, activeExamId]);

  // "All" leaves the status out: the server then returns every topic.
  const query: TopicListQuery = status === 'all' ? {} : { status };
  if (q) query.q = q;
  if (activeSubjectId) query.subjectId = activeSubjectId;
  if (activeExamId) query.examId = activeExamId;

  // While a new search or filter loads, the last results stay on screen.
  const topicsQ = useTopics(query, { keepPrevious: true });
  const updating = topicsQ.isPlaceholderData;
  useRefetchOnFocus(() => topicsQ.refetch());
  const today = useLocalToday();
  const hasFilters = !!(q || activeSubjectId || activeExamId);

  // A search with no results here may match topics under the other status.
  const otherStatus: Status = status === 'active' ? 'completed' : 'active';
  const noResults =
    !updating && !topicsQ.isPending && topicsQ.data?.length === 0;
  const otherQ = useTopics(
    { ...query, status: otherStatus },
    { enabled: !!q && noResults && status !== 'all' },
  );
  const otherCount =
    q && noResults && status !== 'all' ? otherQ.data?.length ?? 0 : 0;
  // An empty Active list may only mean every topic is fully revised.
  const completedQ = useTopics(
    { status: 'completed' },
    { enabled: status === 'active' && noResults && !hasFilters },
  );
  const allRevised =
    status === 'active' && !hasFilters && (completedQ.data?.length ?? 0) > 0;

  const { refreshing, onRefresh } = usePullToRefresh(() => topicsQ.refetch());

  const subjectName = (id: string) =>
    subjectsQ.data?.find(s => s.id === id)?.name;
  const onAdd = () => {
    if (activeExamId) {
      // Filtered on an exam: the new topic starts with that exam ticked.
      navigation.navigate('TopicForm', { examId: activeExamId });
    } else {
      navigation.navigate('TopicForm');
    }
  };
  const open = (t: TopicView) => {
    if (expanded) setSelectedId(t.id);
    else navigation.navigate('TopicDetail', { topicId: t.id });
  };
  const clearFilters = () => {
    setSearch('');
    setQ('');
    setSubjectId('');
    setExamId('');
  };

  const columns = expanded ? 1 : columnsFor(size);
  // Snackbars sit above the floating "+ Add topic" button.
  useSnackbarInsetWhileFocused('topicsFab', FAB_HEIGHT + spacing.lg);

  const header = (
    <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
      <ScreenTitle style={{ marginBottom: 0 }}>{TAB_TITLES.Topics}</ScreenTitle>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
      >
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <TextInput
            accessibilityLabel="Search topics"
            placeholder="Search topics"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
            style={{
              minHeight: 48,
              color: colors.text,
              backgroundColor: colors.input,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: radius.md,
              paddingLeft: spacing.md,
              paddingRight: search ? 48 : spacing.md,
              fontSize: 16,
            }}
          />
          {search ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => {
                setSearch('');
                setQ('');
              }}
              hitSlop={4}
              style={{
                position: 'absolute',
                right: 0,
                minWidth: 48,
                minHeight: 48,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: colors.muted, fontSize: 20 }}>×</Text>
            </Pressable>
          ) : null}
        </View>
        {updating ? (
          <ActivityIndicator
            color={colors.accent}
            accessibilityLabel="Updating list"
          />
        ) : null}
      </View>
      {screenReader ? (
        // TalkBack reaches this before the list; the floating button comes
        // after every topic.
        <Button title="Add topic" variant="secondary" onPress={onAdd} />
      ) : null}
      <ChipSelect
        options={[
          { value: 'active', label: 'Active' },
          { value: 'completed', label: 'Completed' },
          { value: 'all', label: 'All topics' },
        ]}
        value={status}
        groupLabel="Status"
        onChange={v => setStatus(v as Status)}
      />
      {(subjectsQ.data?.length ?? 0) > 0 ? (
        <ChipSelect
          scroll
          label="Subject"
          options={[
            { value: '', label: 'All subjects' },
            ...(subjectsQ.data ?? []).map(s => ({
              value: s.id,
              label: s.name,
            })),
          ]}
          value={activeSubjectId}
          onChange={v => setSubjectId(v as string)}
        />
      ) : null}
      {(examsQ.data?.length ?? 0) > 0 ? (
        <ChipSelect
          scroll
          label="Exam"
          options={[
            { value: '', label: 'All exams' },
            ...(examsQ.data ?? []).map(e => ({ value: e.id, label: e.name })),
          ]}
          value={activeExamId}
          onChange={v => setExamId(v as string)}
        />
      ) : null}
    </View>
  );

  const emptyState = topicsQ.isPending ? (
    <Loading />
  ) : topicsQ.error ? (
    <ErrorRetry
      error={topicsQ.error}
      onRetry={() => topicsQ.refetch()}
      context="topic"
    />
  ) : hasFilters ? (
    otherCount > 0 ? (
      <EmptyState
        title={`No ${status} topics match "${q}"`}
        body={
          otherCount === 1
            ? `1 ${otherStatus} topic matches`
            : `${otherCount} ${otherStatus} topics match`
        }
        actionLabel={`Show ${otherStatus}`}
        onAction={() => setStatus(otherStatus)}
      />
    ) : (
      <EmptyState
        title="No matching topics"
        body="Try another search, or clear the search and filters."
        actionLabel="Clear search & filters"
        onAction={clearFilters}
      />
    )
  ) : status === 'completed' ? (
    <EmptyState
      title="No completed topics yet"
      body="A topic moves here once its last revision is done."
    />
  ) : allRevised ? (
    <EmptyState
      title="No active topics"
      body="All your topics are fully revised. Well done!"
      actionLabel="Show completed"
      onAction={() => setStatus('completed')}
    />
  ) : (
    <EmptyState
      title="No topics yet"
      body="Add what you studied and revisions get scheduled for you."
      actionLabel="Add topic"
      onAction={onAdd}
    />
  );

  const list = (
    <View style={{ flex: 1 }}>
      <ScrollToTopOnTabPress scrollRef={listRef} />
      <FlatList
        ref={listRef}
        testID="topics-list"
        key={columns}
        data={topicsQ.data ?? []}
        keyExtractor={t => t.id}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? { gap: spacing.sm } : undefined}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: 96,
          gap: spacing.sm,
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
        ListEmptyComponent={emptyState}
        extraData={`${updating}|${today}|${selectedId}`}
        renderItem={({ item }) => (
          <TopicRow
            topic={item}
            subject={subjectName(item.subjectId)}
            today={today}
            selected={expanded ? selectedId === item.id : undefined}
            dimmed={updating}
            onPress={() => open(item)}
          />
        )}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add topic"
        onPress={onAdd}
        style={{
          position: 'absolute',
          right: spacing.lg,
          bottom: spacing.lg,
          minHeight: FAB_HEIGHT,
          minWidth: 48,
          paddingHorizontal: spacing.lg,
          justifyContent: 'center',
          borderRadius: radius.pill,
          backgroundColor: colors.accent,
        }}
      >
        <Text style={{ color: colors.accentText, fontWeight: '700' }}>
          + Add topic
        </Text>
      </Pressable>
    </View>
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
