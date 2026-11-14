import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  daysBetween,
  type AgendaItem,
  type LocalDate,
  type TopicView,
} from '@planner/shared';
import type { RootStackParamList } from '../../app/RootNavigator';
import { getReminderStatus } from '../../native/reminders';
import { formatDate } from '../../shared/lib/format';
import { useAppForeground } from '../../shared/lib/useAppForeground';
import { useLocalToday } from '../../shared/lib/useLocalToday';
import { useRefetchOnFocus } from '../../shared/lib/useRefetchOnFocus';
import { Banner } from '../../shared/ui/Banner';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { EmptyState } from '../../shared/ui/EmptyState';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { useResponsive } from '../../shared/ui/responsive';
import { Screen } from '../../shared/ui/Screen';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { AgendaRow } from '../agenda/AgendaRow';
import { useAgenda } from '../agenda/hooks';
import { useExams } from '../exams/hooks';
import { useMe } from '../me/hooks';
import { useTopics } from '../topics/hooks';
import { PomodoroTimer } from './PomodoroTimer';

type NextRevision = { topicName: string; step: number; dueOn: LocalDate };

/** The soonest revision after today: from the agenda, else from the topics. */
function nextRevision(
  upcoming: AgendaItem[],
  topics: TopicView[],
  today: LocalDate,
): NextRevision | null {
  const first = upcoming[0];
  if (first) {
    return { topicName: first.topicName, step: first.step, dueOn: first.dueOn };
  }
  let best: NextRevision | null = null;
  for (const t of topics) {
    if (!t.nextDueOn || t.nextDueOn <= today) continue;
    if (best && best.dueOn <= t.nextDueOn) continue;
    const pending = t.revisions
      .filter(r => r.doneOn === null)
      .sort((a, b) => a.step - b.step)[0];
    best = { topicName: t.name, step: pending?.step ?? 1, dueOn: t.nextDueOn };
  }
  return best;
}

function nextRevisionText(next: NextRevision, today: LocalDate): string {
  const date = formatDate(next.dueOn, today);
  return next.step === 1
    ? `${next.topicName}'s first revision is on ${date}.`
    : `Next up: ${next.topicName}, revision ${next.step}, on ${date}.`;
}

function countdownText(name: string, days: number): string {
  if (days === 0) return `${name} is today`;
  return `${name} in ${days} ${days === 1 ? 'day' : 'days'}`;
}

export function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, spacing } = useTheme();
  const { size } = useResponsive();
  const twoColumns = size !== 'compact';

  const meQ = useMe();
  const examsQ = useExams();
  const today = useLocalToday();
  const agendaQ = useAgenda(30, today);
  const topicsQ = useTopics({ status: 'active' });
  const [remindersOff, setRemindersOff] = useState(false);

  const refreshStatus = useCallback(() => {
    getReminderStatus()
      .then(s => setRemindersOff(s !== null && !s.notificationsEnabled))
      .catch(() => {});
  }, []);
  useEffect(refreshStatus, [refreshStatus]);
  useAppForeground(refreshStatus);
  useRefetchOnFocus(
    refreshStatus,
    () => agendaQ.refetch(),
    () => examsQ.refetch(),
    () => topicsQ.refetch(),
  );

  const firstName = meQ.data?.name?.trim().split(/\s+/)[0];
  const nextExam = (examsQ.data ?? [])
    .filter(e => e.examDate !== null && e.examDate >= today)
    .sort((a, b) =>
      (a.examDate as string).localeCompare(b.examDate as string),
    )[0];

  const items = agendaQ.data ?? [];
  const overdue = items.filter(i => i.bucket === 'overdue');
  const dueToday = items.filter(i => i.bucket === 'today');
  const upcoming = items.filter(i => i.bucket === 'upcoming').slice(0, 5);
  const noTopics =
    topicsQ.data !== undefined && topicsQ.data.length === 0 && !items.length;

  // Remembers that something was due today, to say "All done" once cleared.
  const hadDue = useRef<LocalDate | null>(null);
  if (overdue.length + dueToday.length > 0) hadDue.current = today;
  const allDone = hadDue.current === today;
  const openTopic = (topicId: string) =>
    navigation.navigate('TopicDetail', { topicId });

  const heading = (text: string) => (
    <Text
      accessibilityRole="header"
      style={{
        color: colors.text,
        fontSize: 18,
        fontWeight: '700',
        marginBottom: spacing.xs,
      }}
    >
      {text}
    </Text>
  );

  const rows = (list: AgendaItem[]) =>
    list.map(i => (
      <AgendaRow
        key={`${i.topicId}:${i.revisionId}`}
        item={i}
        onOpenTopic={openTopic}
        today={today}
      />
    ));

  const next = nextRevision(upcoming, topicsQ.data ?? [], today);
  const nothingToday = () => {
    if (noTopics) {
      return (
        <EmptyState
          title="No topics yet"
          body="Add a topic you've studied and we'll plan when to revise it."
          actionLabel="Add your first topic"
          onAction={() => navigation.navigate('TopicForm')}
        />
      );
    }
    if (overdue.length > 0) {
      return (
        <Text style={{ color: colors.muted }}>
          Nothing else due today. Start with the overdue ones above.
        </Text>
      );
    }
    const lead = allDone
      ? 'All done for today. Well done!'
      : 'Nothing to revise today.';
    return (
      <Text style={{ color: colors.muted }}>
        {next ? `${lead} ${nextRevisionText(next, today)}` : lead}
      </Text>
    );
  };

  const overdueCard =
    overdue.length > 0 ? (
      <Card>
        {heading('Overdue')}
        {rows(overdue)}
      </Card>
    ) : null;

  const todayCard = (
    <Card>
      {heading('Today')}
      {agendaQ.isPending ? (
        <Text style={{ color: colors.muted }}>Loading…</Text>
      ) : agendaQ.error && !agendaQ.data ? (
        <ErrorRetry error={agendaQ.error} onRetry={() => agendaQ.refetch()} />
      ) : dueToday.length === 0 ? (
        nothingToday()
      ) : (
        rows(dueToday)
      )}
    </Card>
  );

  const comingUpCard = (
    <Card>
      {heading('Coming up')}
      {agendaQ.isPending ? (
        <Text style={{ color: colors.muted }}>Loading…</Text>
      ) : agendaQ.error && !agendaQ.data ? (
        <ErrorRetry error={agendaQ.error} onRetry={() => agendaQ.refetch()} />
      ) : upcoming.length === 0 ? (
        <Text style={{ color: colors.muted }}>Nothing coming up</Text>
      ) : (
        rows(upcoming)
      )}
    </Card>
  );

  const top = (
    <View style={{ gap: spacing.md }}>
      <View>
        <Text
          accessibilityRole="header"
          style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}
        >
          {firstName ? `Hello, ${firstName}` : 'Hello'}
        </Text>
        {nextExam ? (
          <Text style={{ color: colors.muted }}>
            {countdownText(
              nextExam.name,
              daysBetween(today, nextExam.examDate as string),
            )}
          </Text>
        ) : null}
      </View>
      {remindersOff ? (
        <Banner
          tone="warning"
          text="Reminders are off"
          actionLabel="Fix"
          onAction={() => navigation.navigate('ReminderHealth')}
        />
      ) : null}
    </View>
  );

  const add = (
    <View style={{ alignItems: 'flex-start' }}>
      <Button
        title="+ Add topic"
        onPress={() => navigation.navigate('TopicForm')}
      />
    </View>
  );

  return (
    <Screen fullWidth>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      >
        {top}
        {twoColumns ? (
          <View
            testID="home-columns"
            style={{ flexDirection: 'row', gap: spacing.md }}
          >
            <View style={{ flex: 1, gap: spacing.md }}>
              {add}
              {overdueCard}
              {todayCard}
            </View>
            <View style={{ flex: 1, gap: spacing.md }}>
              {comingUpCard}
              <PomodoroTimer />
            </View>
          </View>
        ) : (
          <>
            {add}
            {overdueCard}
            {todayCard}
            {comingUpCard}
            <PomodoroTimer />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
