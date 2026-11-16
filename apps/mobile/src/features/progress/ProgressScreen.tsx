import React, { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MockTestView, StatsView } from '@planner/shared';
import type { RootStackParamList } from '../../app/RootNavigator';
import { TAB_TITLES } from '../../app/tabTitles';
import {
  ApiError,
  isSessionEndedError,
  userMessage,
} from '../../shared/api/errors';
import { formatDate } from '../../shared/lib/format';
import { useLocalToday } from '../../shared/lib/useLocalToday';
import { useRefetchOnFocus } from '../../shared/lib/useRefetchOnFocus';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { Loading } from '../../shared/ui/Loading';
import { useResponsive } from '../../shared/ui/responsive';
import { Screen } from '../../shared/ui/Screen';
import { ScreenTitle } from '../../shared/ui/ScreenTitle';
import { ScrollToTopOnTabPress } from '../../shared/ui/ScrollToTopOnTabPress';
import { SectionHeading } from '../../shared/ui/SectionHeading';
import {
  useSnackbar,
  useSnackbarInsetWhileFocused,
} from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { usePullToRefresh } from '../../shared/ui/usePullToRefresh';
import { useExams } from '../exams/hooks';
import { topicsForSubject } from '../subjects/showTopics';
import { summariseMockTests, summaryLine } from './mockSummary';
import {
  useDeleteMockTest,
  useMockTests,
  usePendingMockTestDeletes,
  useStats,
} from './hooks';

const FAB_HEIGHT = 48;
/** Rows shown before "Show all", so the screen stays short. */
export const MOCK_TESTS_SHOWN = 5;
export const SUBJECTS_SHOWN = 8;

/**
 * A by-subject row. Revision counts per subject are newer API fields; an
 * older server sends only the topic count, and then no bar is drawn (a bar
 * of topic counts would look like progress when it is not).
 */
type SubjectStat = StatsView['bySubject'][number] & {
  revisionsDone?: number;
  revisionsPending?: number;
};

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export function ProgressScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, radius, spacing } = useTheme();
  const { size } = useResponsive();
  const snackbar = useSnackbar();
  const today = useLocalToday();
  const statsQ = useStats();
  const testsQ = useMockTests();
  const examsQ = useExams();
  const del = useDeleteMockTest();
  const deletingIds = usePendingMockTestDeletes();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [confirmTest, setConfirmTest] = useState<MockTestView | null>(null);
  const [allTests, setAllTests] = useState(false);
  const [allSubjects, setAllSubjects] = useState(false);
  useRefetchOnFocus(
    () => statsQ.refetch(),
    () => testsQ.refetch(),
  );
  const { refreshing, onRefresh } = usePullToRefresh(() =>
    Promise.all([statsQ.refetch(), testsQ.refetch()]),
  );
  // Keeps snackbars clear of the floating "Add mock test" button.
  useSnackbarInsetWhileFocused('progressFab', FAB_HEIGHT + spacing.lg);

  const perRow = size === 'compact' ? 2 : size === 'medium' ? 3 : 4;
  const gap = spacing.sm;
  const tilePct = `${100 / perRow}%` as `${number}%`;

  const examNames = useMemo(
    () => new Map((examsQ.data ?? []).map(e => [e.id, e.name])),
    [examsQ.data],
  );
  const examOf = (t: MockTestView) =>
    t.examId ? examNames.get(t.examId) ?? null : null;
  const summaries = useMemo(
    () => summariseMockTests(testsQ.data ?? [], examNames),
    [testsQ.data, examNames],
  );

  const deleteTest = (t: MockTestView) => {
    setConfirmTest(null);
    // Each delete reports its own result, even when another one starts.
    del
      .mutateAsync(t.id)
      .then(() => snackbar.show({ message: 'Mock test deleted' }))
      .catch(e => {
        // Already gone (e.g. deleted on another device): nothing to undo.
        if (e instanceof ApiError && e.code === 'NOT_FOUND') return;
        if (isSessionEndedError(e)) return;
        snackbar.show({ message: userMessage(e, 'mockTest') });
      });
  };

  const openTopics = () =>
    navigation.navigate('MainTabs', { screen: 'Topics' });
  const openHome = () => navigation.navigate('MainTabs', { screen: 'Home' });

  const stats = statsQ.data;
  // Topic counts match what Home shows (one row per topic); revision counts
  // say "revisions" so the two units are never mixed up. Tiles with a place
  // to go open it: due and overdue topics are listed on Home.
  const tiles: {
    label: string;
    value: number;
    open?: () => void;
    hint?: string;
  }[] = stats
    ? [
        {
          label: 'Topics due today',
          value: stats.dueToday,
          open: openHome,
          hint: "Opens Home, where today's revisions are listed",
        },
        {
          label: 'Topics overdue',
          value: stats.overdue,
          open: openHome,
          hint: 'Opens Home, where overdue revisions are listed',
        },
        { label: 'Revisions done', value: stats.revisionsDone },
        { label: 'Revisions still to do', value: stats.revisionsPending },
        {
          label: 'Topics in total',
          value: stats.topics,
          open: openTopics,
          hint: 'Opens your topics',
        },
        { label: 'Topics completed', value: stats.completedTopics },
      ]
    : [];

  const bySubject = (stats?.bySubject ?? []) as SubjectStat[];
  const hasSubjectProgress = bySubject.some(
    s => s.revisionsDone !== undefined || s.revisionsPending !== undefined,
  );
  const shownSubjects = allSubjects
    ? bySubject
    : bySubject.slice(0, SUBJECTS_SHOWN);
  const tests = testsQ.data ?? [];
  const shownTests = allTests ? tests : tests.slice(0, MOCK_TESTS_SHOWN);

  const showAll = (
    total: number,
    shown: number,
    expanded: boolean,
    toggle: () => void,
    what: string,
  ) =>
    total > shown || expanded ? (
      <View style={{ alignItems: 'flex-start', marginTop: spacing.xs }}>
        <Button
          title={expanded ? 'Show less' : `Show all (${total})`}
          accessibilityLabel={
            expanded ? `Show fewer ${what}` : `Show all ${total} ${what}`
          }
          variant="text"
          onPress={toggle}
        />
      </View>
    ) : null;

  const tile = (t: (typeof tiles)[number]) => {
    const body = (
      <>
        <Text
          style={{
            color: colors.text,
            fontSize: 28,
            fontWeight: '700',
          }}
        >
          {t.value}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Text
            style={{
              color: t.open ? colors.accent : colors.muted,
              flexShrink: 1,
            }}
          >
            {t.label}
          </Text>
          {t.open ? <Text style={{ color: colors.accent }}>{' ›'}</Text> : null}
        </View>
      </>
    );
    const box = {
      flex: 1,
      backgroundColor: colors.surface,
      borderColor: colors.line,
      borderWidth: 1,
      borderRadius: radius.lg,
      padding: spacing.md,
      minHeight: 48,
    };
    return (
      <View
        key={t.label}
        testID="stat-tile"
        style={{ width: tilePct, padding: gap / 2 }}
      >
        {t.open ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t.label}: ${t.value}`}
            accessibilityHint={t.hint}
            onPress={t.open}
            style={box}
          >
            {body}
          </Pressable>
        ) : (
          <View
            accessible
            accessibilityLabel={`${t.label}: ${t.value}`}
            style={box}
          >
            {body}
          </View>
        )}
      </View>
    );
  };

  const subjectRow = (s: SubjectStat) => {
    const done = s.revisionsDone ?? 0;
    const total = done + (s.revisionsPending ?? 0);
    const topics = plural(s.topicCount, 'topic');
    const detail = hasSubjectProgress
      ? `${done} of ${plural(total, 'revision')} done · ${topics}`
      : topics;
    return (
      <Pressable
        key={s.subjectId}
        testID="subject-row"
        accessibilityRole="button"
        accessibilityLabel={`${s.name}, ${detail}`}
        accessibilityHint="Shows the topics in this subject"
        onPress={() =>
          navigation.navigate('MainTabs', topicsForSubject(s.subjectId))
        }
        style={{
          minHeight: 48,
          justifyContent: 'center',
          paddingVertical: spacing.xs,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            columnGap: spacing.sm,
          }}
        >
          <Text style={{ color: colors.text, flexShrink: 1 }}>{s.name}</Text>
          <Text style={{ color: colors.muted }}>{detail}</Text>
        </View>
        {hasSubjectProgress ? (
          <View
            style={{
              height: 8,
              borderRadius: radius.pill,
              backgroundColor: colors.line,
              marginTop: spacing.xs,
            }}
          >
            <View
              testID="subject-bar"
              style={{
                height: 8,
                borderRadius: radius.pill,
                backgroundColor: colors.accent,
                width: `${total > 0 ? (done / total) * 100 : 0}%`,
              }}
            />
          </View>
        ) : null}
      </Pressable>
    );
  };

  const testRow = (t: MockTestView) => {
    const deleting = deletingIds.includes(t.id);
    const exam = examOf(t);
    const date = formatDate(t.takenOn, today);
    const spoken = [
      t.title,
      exam,
      date,
      `${t.score} out of ${t.maxScore}`,
      `${t.percent} percent`,
      t.notes ? `Notes: ${t.notes}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    return (
      <Pressable
        key={t.id}
        testID="mock-test-row"
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint="Opens the mock test so you can correct it"
        accessibilityState={{ disabled: deleting, busy: deleting }}
        onPress={() => navigation.navigate('MockTestForm', { id: t.id })}
        onLongPress={() => setConfirmTest(t)}
        disabled={deleting}
        style={{
          opacity: deleting ? 0.5 : 1,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 48,
          paddingVertical: spacing.xs,
        }}
      >
        <View style={{ flexShrink: 1, flexGrow: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>
            {t.title}
          </Text>
          <Text style={{ color: colors.muted }}>
            {exam ? `${exam} · ` : ''}
            {date} · {t.score}/{t.maxScore} · {t.percent}%
          </Text>
          {t.notes ? (
            <Text numberOfLines={1} style={{ color: colors.muted }}>
              {t.notes}
            </Text>
          ) : null}
        </View>
        <Button
          title="Delete"
          variant="dangerText"
          accessibilityLabel={`Delete ${t.title}`}
          loading={deleting}
          onPress={() => setConfirmTest(t)}
        />
      </Pressable>
    );
  };

  const multiExam = summaries.length > 1;

  return (
    <Screen fullWidth>
      <View style={{ flex: 1 }}>
        <ScrollToTopOnTabPress scrollRef={scrollRef} />
        <ScrollView
          ref={scrollRef}
          testID="progress-scroll"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.accent]}
              tintColor={colors.accent}
              progressBackgroundColor={colors.surface}
            />
          }
          contentContainerStyle={{
            padding: spacing.lg,
            // Room for the floating button under the last row.
            paddingBottom: FAB_HEIGHT + spacing.lg * 3,
            gap: spacing.md,
            width: '100%',
            maxWidth: 960,
            alignSelf: 'center',
          }}
        >
          <ScreenTitle style={{ marginBottom: 0 }}>
            {TAB_TITLES.Progress}
          </ScreenTitle>

          {statsQ.isPending ? (
            <Loading inline />
          ) : !stats ? (
            <ErrorRetry error={statsQ.error} onRetry={() => statsQ.refetch()} />
          ) : (
            <View
              testID="stat-tiles"
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                marginHorizontal: -gap / 2,
              }}
            >
              {tiles.map(tile)}
            </View>
          )}

          <Card>
            <SectionHeading>Mock tests</SectionHeading>
            {testsQ.isPending ? (
              <Loading inline />
            ) : !testsQ.data ? (
              <ErrorRetry
                error={testsQ.error}
                context="mockTest"
                onRetry={() => testsQ.refetch()}
              />
            ) : tests.length === 0 ? (
              <Text style={{ color: colors.muted }}>
                No mock tests yet — tap Add mock test to log your first one
              </Text>
            ) : (
              <>
                <View
                  testID="mock-summary"
                  style={{ marginBottom: spacing.sm }}
                >
                  {summaries.map(s => (
                    <Text
                      key={s.examName ?? ''}
                      style={{ color: colors.text, marginTop: spacing.xs }}
                    >
                      {multiExam ? (
                        <Text style={{ fontWeight: '700' }}>
                          {s.examName ?? 'No exam'}:{' '}
                        </Text>
                      ) : null}
                      {summaryLine(s)}
                    </Text>
                  ))}
                </View>
                {shownTests.map(testRow)}
                {showAll(
                  tests.length,
                  MOCK_TESTS_SHOWN,
                  allTests,
                  () => setAllTests(v => !v),
                  'mock tests',
                )}
              </>
            )}
          </Card>

          {stats ? (
            <Card>
              <SectionHeading>
                {hasSubjectProgress ? 'By subject' : 'Topics by subject'}
              </SectionHeading>
              {bySubject.length === 0 ? (
                <Text style={{ color: colors.muted }}>No topics yet</Text>
              ) : (
                <>
                  {shownSubjects.map(subjectRow)}
                  {showAll(
                    bySubject.length,
                    SUBJECTS_SHOWN,
                    allSubjects,
                    () => setAllSubjects(v => !v),
                    'subjects',
                  )}
                </>
              )}
            </Card>
          ) : null}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add mock test"
          onPress={() => navigation.navigate('MockTestForm')}
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
            + Add mock test
          </Text>
        </Pressable>
      </View>
      <ConfirmDialog
        visible={confirmTest !== null}
        title="Delete mock test?"
        message={
          confirmTest
            ? `${confirmTest.title} from ${formatDate(
                confirmTest.takenOn,
                today,
              )} will be deleted. This can't be undone.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmTest && deleteTest(confirmTest)}
        onCancel={() => setConfirmTest(null)}
      />
    </Screen>
  );
}
