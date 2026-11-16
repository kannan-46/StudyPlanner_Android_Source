import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  Text,
  View,
  type HostInstance,
  type ScrollViewInstance,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutationState } from '@tanstack/react-query';
import {
  daysBetween,
  type AgendaItem,
  type LocalDate,
  type TopicView,
} from '@planner/shared';
import type { RootStackParamList } from '../../app/RootNavigator';
import { getReminderStatus } from '../../native/reminders';
import { useAppForeground } from '../../shared/lib/useAppForeground';
import { useLocalToday } from '../../shared/lib/useLocalToday';
import { useRefetchOnFocus } from '../../shared/lib/useRefetchOnFocus';
import { Banner } from '../../shared/ui/Banner';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
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
import { useMe } from '../me/hooks';
import {
  AGENDA_DAYS,
  EMPTY_TEXT,
  laterRevisionText,
  nextRevision,
  nextRevisionText,
} from '../schedule/agendaText';
import { useTopics } from '../topics/hooks';
import { PomodoroTimer } from './PomodoroTimer';

/** How many upcoming revisions the Coming up card previews. */
export const COMING_UP_PREVIEW = 5;

/** The Coming up card's link to the Schedule tab. */
export const SEE_ALL_UPCOMING_TEXT = 'See all upcoming';

/** How many upcoming revisions the Coming up card leaves out. */
export const moreUpcomingText = (n: number) =>
  `${n} more in the next ${AGENDA_DAYS} days`;

/** The phone-only shortcut down to the focus timer card. */
export const FOCUS_SHORTCUT_TEXT = 'Go to focus timer';

export const NOTIFICATIONS_BLOCKED_TEXT =
  "Notifications are off — your daily reminder can't show";

function countdownText(name: string, days: number): string {
  if (days === 0) return `${name} is today`;
  return `${name} in ${days} ${days === 1 ? 'day' : 'days'}`;
}

type RevisionChange = {
  undo: boolean;
  topicId: string;
  doneOn: string | null;
  at: number;
};

/**
 * True when a revision was marked done today and not taken back: from the
 * saved topics, or from a Done that is still being saved (or saved, with the
 * topic list not reloaded yet). Done on any screen counts, and it survives a
 * remount, because both come from shared caches.
 */
function useDoneToday(
  topics: TopicView[] | undefined,
  today: LocalDate,
): boolean {
  const changes = useMutationState({
    filters: {
      mutationKey: ['revision'],
      // Done and Undo only (a snooze says nothing about today's work).
      predicate: m =>
        (m.options.mutationKey?.[1] === 'complete' ||
          m.options.mutationKey?.[1] === 'undo') &&
        (m.state.status === 'pending' || m.state.status === 'success'),
    },
    select: (m): RevisionChange => {
      const v = m.state.variables as { topicId: string; doneOn?: string };
      return {
        undo: m.options.mutationKey?.[1] === 'undo',
        topicId: v.topicId,
        doneOn: v.doneOn ?? null,
        at: m.state.submittedAt,
      };
    },
  });
  const latest = new Map<string, RevisionChange>();
  for (const c of changes) {
    const prev = latest.get(c.topicId);
    if (!prev || c.at >= prev.at) latest.set(c.topicId, c);
  }
  if ([...latest.values()].some(c => !c.undo && c.doneOn === today)) {
    return true;
  }
  return (topics ?? []).some(t => t.revisions.some(r => r.doneOn === today));
}

/** A refresh failure is worth a snackbar whenever older data stays shown. */
const reportRefresh = (r: RefreshResult) => r.isError && r.data !== undefined;

export function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, spacing } = useTheme();
  const { size } = useResponsive();
  const twoColumns = size !== 'compact';
  const scrollRef = useRef<ScrollViewInstance>(null);
  const timerRef = useRef<HostInstance>(null);

  const meQ = useMe();
  const examsQ = useExams();
  const today = useLocalToday();
  const agendaQ = useAgenda(AGENDA_DAYS, today);
  // Every topic, not only active ones: "no topics yet" and "every topic
  // fully revised" are different situations.
  const topicsQ = useTopics();
  const [notifBlocked, setNotifBlocked] = useState(false);

  const refreshStatus = useCallback(() => {
    getReminderStatus()
      .then(s => setNotifBlocked(s !== null && !s.notificationsEnabled))
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
  const { refreshing, onRefresh } = usePullToRefresh(
    () => {
      refreshStatus();
      return Promise.all([
        agendaQ.refetch(),
        topicsQ.refetch(),
        examsQ.refetch(),
        meQ.refetch(),
      ]);
    },
    { shouldReport: reportRefresh },
  );
  // Only a user who wants the daily reminder needs to hear it can't show.
  const remindersBlocked =
    notifBlocked && meQ.data?.settings.dailyReminder === true;

  const firstName = meQ.data?.name?.trim().split(/\s+/)[0];
  const nextExam = (examsQ.data ?? [])
    .filter(e => e.examDate !== null && e.examDate >= today)
    .sort((a, b) =>
      (a.examDate as string).localeCompare(b.examDate as string),
    )[0];

  const items = agendaQ.data ?? [];
  const overdue = items.filter(i => i.bucket === 'overdue');
  const dueToday = items.filter(i => i.bucket === 'today');
  const allUpcoming = items.filter(i => i.bucket === 'upcoming');
  const upcoming = allUpcoming.slice(0, COMING_UP_PREVIEW);
  const allTopics = topicsQ.data;
  const activeTopics = (allTopics ?? []).filter(t => t.status === 'active');
  const noTopics =
    allTopics !== undefined && allTopics.length === 0 && !items.length;
  const allRevised =
    allTopics !== undefined &&
    allTopics.length > 0 &&
    activeTopics.length === 0 &&
    !items.length;
  const emptyAccount = noTopics || allRevised;
  // Until either list says the user has topics, the add button and the
  // Coming up card wait, so a new user never sees them flash in and out.
  const topicsKnown =
    allTopics !== undefined || !!topicsQ.error || items.length > 0;
  const agendaFailed = !!agendaQ.error && !agendaQ.data;
  const doneToday = useDoneToday(allTopics, today);

  const openTopic = (topicId: string) =>
    navigation.navigate('TopicDetail', { topicId });
  const addTopic = () => navigation.navigate('TopicForm');
  const retryLoad = () => {
    agendaQ.refetch();
    if (topicsQ.error) topicsQ.refetch();
  };
  const scrollToTimer = () => {
    const sv = scrollRef.current;
    const inner = sv?.getInnerViewRef();
    const timer = timerRef.current;
    if (!sv || !inner || !timer) return;
    timer.measureLayout(
      inner,
      (_x, y) => sv.scrollTo({ y: Math.max(0, y - spacing.lg) }),
      () => {},
    );
  };

  const rows = (list: AgendaItem[]) =>
    list.map((i, index) => (
      <AgendaRow
        key={`${i.topicId}:${i.revisionId}`}
        item={i}
        onOpenTopic={openTopic}
        today={today}
        divider={index > 0}
      />
    ));

  const next = nextRevision(upcoming, activeTopics, today);
  const nothingToday = () => {
    if (overdue.length > 0) {
      return (
        <Text style={{ color: colors.muted }}>
          Nothing else due today. Start with the overdue ones above.
        </Text>
      );
    }
    // What to say about an empty day depends on the topics.
    if (topicsQ.isPending) return <Loading inline />;
    if (!items.length && topicsQ.error && !allTopics) {
      return (
        <ErrorRetry error={topicsQ.error} onRetry={() => topicsQ.refetch()} />
      );
    }
    if (noTopics) {
      return (
        <EmptyState
          title={EMPTY_TEXT.noTopics.title}
          body={EMPTY_TEXT.noTopics.body}
          actionLabel={EMPTY_TEXT.noTopics.action}
          onAction={addTopic}
        />
      );
    }
    if (allRevised) {
      return (
        <EmptyState
          title={EMPTY_TEXT.allRevised.title}
          body={EMPTY_TEXT.allRevised.body}
          actionLabel={EMPTY_TEXT.allRevised.action}
          onAction={addTopic}
        />
      );
    }
    const lead = doneToday
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
        <SectionHeading>Overdue</SectionHeading>
        {rows(overdue)}
      </Card>
    ) : null;

  // The only place a failed agenda shows: one message, one Retry.
  const todayCard = (
    <Card>
      <SectionHeading>Today</SectionHeading>
      {agendaQ.isPending ? (
        <Loading inline />
      ) : agendaFailed ? (
        <ErrorRetry error={agendaQ.error} onRetry={retryLoad} />
      ) : dueToday.length === 0 ? (
        nothingToday()
      ) : (
        rows(dueToday)
      )}
    </Card>
  );

  const seeAll =
    allUpcoming.length > upcoming.length ? (
      <View style={{ alignItems: 'flex-start' }}>
        <Text style={{ color: colors.muted }}>
          {moreUpcomingText(allUpcoming.length - upcoming.length)}
        </Text>
        {/* Not "See all N": Schedule keeps its exam filter, so it may show
            fewer than N rows. */}
        <Button
          variant="text"
          title={SEE_ALL_UPCOMING_TEXT}
          onPress={() =>
            navigation.navigate('MainTabs', { screen: 'Schedule' })
          }
        />
      </View>
    ) : null;

  const comingUpCard =
    !agendaFailed && !emptyAccount && topicsKnown ? (
      <Card>
        <SectionHeading>Coming up</SectionHeading>
        {agendaQ.isPending ? (
          <Loading inline />
        ) : upcoming.length > 0 ? (
          <>
            {rows(upcoming)}
            {seeAll}
          </>
        ) : topicsQ.isPending ? (
          <Loading inline />
        ) : (
          <Text style={{ color: colors.muted }}>
            {next
              ? `${EMPTY_TEXT.nothingComingUp}. ${laterRevisionText(
                  next,
                  today,
                )}`
              : EMPTY_TEXT.nothingComingUp}
          </Text>
        )}
      </Card>
    ) : null;

  const top = (
    <View style={{ gap: spacing.md }}>
      <View>
        <ScreenTitle style={{ marginBottom: 0 }}>
          {firstName ? `Hello, ${firstName}` : 'Hello'}
        </ScreenTitle>
        {nextExam ? (
          <Text style={{ color: colors.muted }}>
            {countdownText(
              nextExam.name,
              daysBetween(today, nextExam.examDate as string),
            )}
          </Text>
        ) : null}
      </View>
      {remindersBlocked ? (
        <Banner
          tone="warning"
          text={NOTIFICATIONS_BLOCKED_TEXT}
          actionLabel="Fix"
          onAction={() => navigation.navigate('ReminderHealth')}
        />
      ) : null}
    </View>
  );

  // On a phone the timer sits below the revisions: a shortcut reaches it
  // without scrolling past them.
  const showTimerShortcut = !twoColumns && overdue.length + dueToday.length > 0;
  const add =
    topicsKnown && !emptyAccount ? (
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: spacing.sm,
        }}
      >
        <Button title="+ Add topic" onPress={addTopic} />
        {showTimerShortcut ? (
          <Button
            variant="text"
            title={FOCUS_SHORTCUT_TEXT}
            accessibilityHint="Scrolls down to the focus timer"
            onPress={scrollToTimer}
          />
        ) : null}
      </View>
    ) : null;

  return (
    <Screen fullWidth>
      <ScrollToTopOnTabPress scrollRef={scrollRef} />
      <ScrollView
        ref={scrollRef}
        testID="home-scroll"
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.accent]}
            tintColor={colors.accent}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        {top}
        {/* One tree for both layouts: switching (e.g. on rotation) must not
            remount the focus timer and lose a running session. */}
        <View
          testID={twoColumns ? 'home-columns' : undefined}
          style={{
            flexDirection: twoColumns ? 'row' : 'column',
            gap: spacing.md,
          }}
        >
          <View style={[{ gap: spacing.md }, twoColumns && { flex: 1 }]}>
            {add}
            {overdueCard}
            {todayCard}
          </View>
          <View style={[{ gap: spacing.md }, twoColumns && { flex: 1 }]}>
            {/* Above Coming up: right after today's revisions on a phone,
                at the top of the second column on a tablet. */}
            <View ref={timerRef} testID="home-focus-timer" collapsable={false}>
              <PomodoroTimer />
            </View>
            {comingUpCard}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
