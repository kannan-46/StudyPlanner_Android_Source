import React from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MockTestView } from '@planner/shared';
import type { RootStackParamList } from '../../app/RootNavigator';
import { formatDate } from '../../shared/lib/format';
import { useRefetchOnFocus } from '../../shared/lib/useRefetchOnFocus';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { useResponsive } from '../../shared/ui/responsive';
import { Screen } from '../../shared/ui/Screen';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useDeleteMockTest, useMockTests, useStats } from './hooks';

export function ProgressScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, radius, spacing } = useTheme();
  const { size } = useResponsive();
  const snackbar = useSnackbar();
  const statsQ = useStats();
  const testsQ = useMockTests();
  const del = useDeleteMockTest();
  useRefetchOnFocus(
    () => statsQ.refetch(),
    () => testsQ.refetch(),
  );

  const perRow = size === 'compact' ? 2 : size === 'medium' ? 3 : 4;
  const gap = spacing.sm;
  const tilePct = `${100 / perRow}%` as `${number}%`;

  const confirmDelete = (t: MockTestView) =>
    Alert.alert('Delete mock test?', t.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          del.mutate(t.id, {
            onError: () =>
              snackbar.show({ message: "Couldn't delete — try again" }),
          }),
      },
    ]);

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

  const stats = statsQ.data;
  const tiles: [string, number][] = stats
    ? [
        ['Topics', stats.topics],
        ['Revisions done', stats.revisionsDone],
        ['Pending', stats.revisionsPending],
        ['Overdue', stats.overdue],
        ['Completed topics', stats.completedTopics],
      ]
    : [];
  const maxCount = Math.max(
    1,
    ...(stats?.bySubject ?? []).map(s => s.topicCount),
  );

  return (
    <Screen fullWidth>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          gap: spacing.md,
          width: '100%',
          maxWidth: 960,
          alignSelf: 'center',
        }}
      >
        <Text
          accessibilityRole="header"
          style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}
        >
          Progress
        </Text>

        {statsQ.isPending ? (
          <Text style={{ color: colors.muted }}>Loading…</Text>
        ) : !stats ? (
          <ErrorRetry error={statsQ.error} onRetry={() => statsQ.refetch()} />
        ) : (
          <>
            <View
              testID="stat-tiles"
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                marginHorizontal: -gap / 2,
              }}
            >
              {tiles.map(([label, value]) => (
                <View
                  key={label}
                  testID="stat-tile"
                  style={{ width: tilePct, padding: gap / 2 }}
                >
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: colors.surface,
                      borderColor: colors.line,
                      borderWidth: 1,
                      borderRadius: radius.lg,
                      padding: spacing.md,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 28,
                        fontWeight: '700',
                      }}
                    >
                      {value}
                    </Text>
                    <Text style={{ color: colors.muted }}>{label}</Text>
                  </View>
                </View>
              ))}
            </View>

            <Card>
              {heading('By subject')}
              {stats.bySubject.length === 0 ? (
                <Text style={{ color: colors.muted }}>No topics yet</Text>
              ) : (
                stats.bySubject.map(s => (
                  <View key={s.subjectId} style={{ marginTop: spacing.sm }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text style={{ color: colors.text, flexShrink: 1 }}>
                        {s.name}
                      </Text>
                      <Text style={{ color: colors.muted }}>
                        {s.topicCount}
                      </Text>
                    </View>
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
                          width: `${(s.topicCount / maxCount) * 100}%`,
                        }}
                      />
                    </View>
                  </View>
                ))
              )}
            </Card>
          </>
        )}

        <Card>
          {heading('Mock tests')}
          {testsQ.isPending ? (
            <Text style={{ color: colors.muted }}>Loading…</Text>
          ) : !testsQ.data ? (
            <ErrorRetry error={testsQ.error} onRetry={() => testsQ.refetch()} />
          ) : testsQ.data.length === 0 ? (
            <Text style={{ color: colors.muted }}>No mock tests yet</Text>
          ) : (
            testsQ.data.map(t => (
              <Pressable
                key={t.id}
                accessibilityHint="Long press to delete"
                onLongPress={() => confirmDelete(t)}
                style={{
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
                    {formatDate(t.takenOn)} · {t.score}/{t.maxScore} ·{' '}
                    {t.percent}%
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${t.title}`}
                  onPress={() => confirmDelete(t)}
                  style={{
                    minHeight: 48,
                    minWidth: 48,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: colors.danger, fontWeight: '600' }}>
                    Delete
                  </Text>
                </Pressable>
              </Pressable>
            ))
          )}
          <View style={{ alignItems: 'flex-start', marginTop: spacing.sm }}>
            <Button
              title="Add mock test"
              onPress={() => navigation.navigate('MockTestForm')}
            />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
