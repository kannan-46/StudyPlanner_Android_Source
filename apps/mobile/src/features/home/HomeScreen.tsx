import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { daysBetween, localToday } from '@planner/shared';
import type { RootStackParamList } from '../../app/RootNavigator';
import { getReminderStatus } from '../../native/reminders';
import { useAppForeground } from '../../shared/lib/useAppForeground';
import { useRefetchOnFocus } from '../../shared/lib/useRefetchOnFocus';
import { Banner } from '../../shared/ui/Banner';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { useResponsive } from '../../shared/ui/responsive';
import { Screen } from '../../shared/ui/Screen';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { AgendaRow } from '../agenda/AgendaRow';
import { useAgenda } from '../agenda/hooks';
import { useExams } from '../exams/hooks';
import { useMe } from '../me/hooks';
import { PomodoroTimer } from './PomodoroTimer';

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
  const agendaQ = useAgenda(30);
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
  );

  const today = localToday();
  const firstName = meQ.data?.name?.trim().split(/\s+/)[0];
  const nextExam = (examsQ.data ?? [])
    .filter(e => e.examDate !== null && e.examDate >= today)
    .sort((a, b) =>
      (a.examDate as string).localeCompare(b.examDate as string),
    )[0];

  const items = agendaQ.data ?? [];
  const due = items.filter(i => i.bucket === 'overdue' || i.bucket === 'today');
  const upcoming = items.filter(i => i.bucket === 'upcoming').slice(0, 5);
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

  const todayCard = (
    <Card>
      {heading('Today')}
      {agendaQ.isPending ? (
        <Text style={{ color: colors.muted }}>Loading…</Text>
      ) : agendaQ.error && !agendaQ.data ? (
        <ErrorRetry error={agendaQ.error} onRetry={() => agendaQ.refetch()} />
      ) : due.length === 0 ? (
        <Text style={{ color: colors.muted }}>Nothing due today</Text>
      ) : (
        due.map(i => (
          <AgendaRow
            key={`${i.topicId}:${i.revisionId}`}
            item={i}
            onOpenTopic={openTopic}
          />
        ))
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
        upcoming.map(i => (
          <AgendaRow
            key={`${i.topicId}:${i.revisionId}`}
            item={i}
            onOpenTopic={openTopic}
          />
        ))
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
              {todayCard}
              {add}
            </View>
            <View style={{ flex: 1, gap: spacing.md }}>
              {comingUpCard}
              <PomodoroTimer />
            </View>
          </View>
        ) : (
          <>
            {todayCard}
            {comingUpCard}
            <PomodoroTimer />
            {add}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
