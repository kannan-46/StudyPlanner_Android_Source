import React, { useEffect, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  localToday,
  type TopicListQuery,
  type TopicView,
} from '@planner/shared';
import type { RootStackParamList } from '../../app/RootNavigator';
import { relativeDay } from '../../shared/lib/format';
import { Card } from '../../shared/ui/Card';
import { ChipSelect } from '../../shared/ui/ChipSelect';
import { EmptyState } from '../../shared/ui/EmptyState';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { Loading } from '../../shared/ui/Loading';
import { columnsFor, useResponsive } from '../../shared/ui/responsive';
import { Screen } from '../../shared/ui/Screen';
import { useSnackbarInsetWhileFocused } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useExams } from '../exams/hooks';
import { useSubjects } from '../subjects/hooks';
import { useRefetchOnFocus } from '../../shared/lib/useRefetchOnFocus';
import { useTopics } from './hooks';
import { TopicDetailContent } from './TopicDetailScreen';

type Status = 'active' | 'completed';

const FAB_HEIGHT = 48;

function progressLabel(t: TopicView): string {
  const total = t.revisions.length;
  const next = [...t.revisions]
    .sort((a, b) => a.step - b.step)
    .find(r => r.doneOn === null);
  return `R${next ? next.step : total}/${total}`;
}

function TopicRow({
  topic,
  subject,
  today,
  selected,
  onPress,
}: {
  topic: TopicView;
  subject?: string;
  today: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ flex: 1, minHeight: 48 }}
    >
      <Card
        style={{
          borderColor: selected ? colors.accent : colors.line,
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: spacing.sm,
        }}
      >
        <View style={{ flexShrink: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>
            {topic.name}
          </Text>
          {subject ? (
            <Text style={{ color: colors.muted }}>{subject}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: colors.text }}>
            {topic.nextDueOn
              ? relativeDay(topic.nextDueOn, today)
              : topic.status === 'completed'
              ? 'Completed'
              : '—'}
          </Text>
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

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [examId, setExamId] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const query: TopicListQuery = { status };
  if (q) query.q = q;
  if (subjectId) query.subjectId = subjectId;
  if (examId) query.examId = examId;

  // While a new search or filter loads, the last results stay on screen.
  const topicsQ = useTopics(query, { keepPrevious: true });
  const updating = topicsQ.isPlaceholderData;
  const subjectsQ = useSubjects();
  useRefetchOnFocus(() => topicsQ.refetch());
  const examsQ = useExams();
  const today = localToday();
  const hasFilters = !!(q || subjectId || examId);

  const subjectName = (id: string) =>
    subjectsQ.data?.find(s => s.id === id)?.name;
  const onAdd = () => navigation.navigate('TopicForm');
  const open = (t: TopicView) => {
    if (expanded) setSelectedId(t.id);
    else navigation.navigate('TopicDetail', { topicId: t.id });
  };
  const refresh = async () => {
    setRefreshing(true);
    try {
      await topicsQ.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const columns = expanded ? 1 : columnsFor(size);
  // Snackbars sit above the floating "+ Add topic" button.
  useSnackbarInsetWhileFocused('topicsFab', FAB_HEIGHT + spacing.lg);
  const filterLabel = (text: string) => (
    <Text style={{ color: colors.muted }}>{text}</Text>
  );

  const header = (
    <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
            borderColor: colors.line,
            borderWidth: 1,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            fontSize: 16,
            flex: 1,
          }}
        />
        {updating ? (
          <ActivityIndicator
            color={colors.accent}
            accessibilityLabel="Updating list"
            style={{ marginLeft: spacing.sm }}
          />
        ) : null}
      </View>
      <ChipSelect
        options={[
          { value: 'active', label: 'Active' },
          { value: 'completed', label: 'Completed' },
        ]}
        value={status}
        onChange={v => setStatus(v as Status)}
      />
      {(subjectsQ.data?.length ?? 0) > 0 ? (
        <>
          {filterLabel('Subject')}
          <ChipSelect
            options={[
              { value: '', label: 'All subjects' },
              ...(subjectsQ.data ?? []).map(s => ({
                value: s.id,
                label: s.name,
              })),
            ]}
            value={subjectId}
            onChange={v => setSubjectId(v as string)}
          />
        </>
      ) : null}
      {(examsQ.data?.length ?? 0) > 0 ? (
        <>
          {filterLabel('Exam')}
          <ChipSelect
            options={[
              { value: '', label: 'All exams' },
              ...(examsQ.data ?? []).map(e => ({ value: e.id, label: e.name })),
            ]}
            value={examId}
            onChange={v => setExamId(v as string)}
          />
        </>
      ) : null}
    </View>
  );

  const list = (
    <View style={{ flex: 1 }}>
      <FlatList
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
            onRefresh={refresh}
            colors={[colors.accent]}
            tintColor={colors.accent}
            progressBackgroundColor={colors.surface}
          />
        }
        ListHeaderComponent={header}
        ListEmptyComponent={
          topicsQ.isPending ? (
            <Loading />
          ) : topicsQ.error ? (
            <ErrorRetry
              error={topicsQ.error}
              onRetry={() => topicsQ.refetch()}
            />
          ) : hasFilters || status === 'completed' ? (
            <EmptyState title="No matching topics" />
          ) : (
            <EmptyState
              title="No topics yet"
              body="Add what you studied and revisions get scheduled for you."
              actionLabel="Add topic"
              onAction={onAdd}
            />
          )
        }
        style={{ opacity: updating ? 0.6 : 1 }}
        renderItem={({ item }) => (
          <TopicRow
            topic={item}
            subject={subjectName(item.subjectId)}
            today={today}
            selected={expanded && selectedId === item.id}
            onPress={() => open(item)}
          />
        )}
      />
      <Pressable
        accessibilityRole="button"
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
