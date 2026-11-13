import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import type {PlannerDocument} from '../types/planner';
import {allRevisions, completedRevisionCount, dueRevisions, localDateString, totalRevisionCount} from '../planner/revisions';
import type {Theme} from '../ui/theme';
import {BodyText, Button, Card, Heading, MutedText, Page, ProgressBar} from '../ui/components';

export type TabName = 'Home' | 'Topics' | 'Schedule' | 'Progress' | 'Settings';

export function HomeScreen({
  planner,
  theme,
  live,
  saving,
  onNavigate,
  onComplete,
  onSnooze,
}: {
  planner: PlannerDocument;
  theme: Theme;
  live: boolean;
  saving: boolean;
  onNavigate: (tab: TabName) => void;
  onComplete: (topicId: string, revisionIndex: number) => void;
  onSnooze: (topicId: string, revisionIndex: number) => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const due = useMemo(() => dueRevisions(planner), [planner]);
  const nextRows = useMemo(() => allRevisions(planner)
    .filter(revision => !revision.done)
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, 5), [planner]);
  const completed = completedRevisionCount(planner);
  const total = totalRevisionCount(planner);
  const percent = total ? Math.round(completed * 100 / total) : 0;
  const msTopics = planner.topics.filter(topic => topic.exam === 'MS General Surgery' || topic.exam === 'Both').length;
  const neetTopics = planner.topics.filter(topic => topic.exam === 'NEET SS' || topic.exam === 'Both').length;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setSecondsLeft(current => {
        if (current <= 1) {
          setRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1_000);
    return () => clearInterval(timer);
  }, [running]);

  const timerText = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;

  return (
    <Page theme={theme}>
      <View style={styles.welcome}>
        <View style={styles.welcomeCopy}>
          <Heading theme={theme}>Good study day 🩺</Heading>
          <MutedText theme={theme}>{localDateString()} · {live ? 'Live sync connected' : 'Connecting to live sync'}</MutedText>
        </View>
        <View style={[styles.liveDot, {backgroundColor: live ? theme.success : theme.muted}]} />
      </View>
      <View style={styles.statGrid}>
        <Stat theme={theme} value={String(planner.topics.length)} label="Topics added" />
        <Stat theme={theme} value={String(due.length)} label="Revisions due" />
        <Stat theme={theme} value={String(completed)} label="Revisions done" />
        <Stat theme={theme} value={`${percent}%`} label="Study progress" />
      </View>
      <View style={styles.statGrid}>
        <Stat theme={theme} value={String(msTopics)} label="MS Surgery topics" />
        <Stat theme={theme} value={String(neetTopics)} label="NEET SS topics" />
      </View>

      <View style={styles.sectionHeader}>
        <Heading theme={theme}>Today's revision queue</Heading>
        <Button theme={theme} kind="text" compact label="View schedule" onPress={() => onNavigate('Schedule')} />
      </View>
      {due.length ? due.slice(0, 6).map(row => (
        <Card theme={theme} key={`${row.topicId}-${row.revisionIndex}`}>
          <BodyText theme={theme} style={styles.topicName}>{row.topicName}</BodyText>
          <MutedText theme={theme}>{row.subject || 'Uncategorised'} · {row.exam} · Day {row.day} · {row.date}</MutedText>
          <View style={styles.actions}>
            <Button theme={theme} compact label="Mark done" disabled={saving} onPress={() => onComplete(row.topicId, row.revisionIndex)} />
            <Button theme={theme} kind="secondary" compact label="Snooze 1 day" disabled={saving} onPress={() => onSnooze(row.topicId, row.revisionIndex)} />
          </View>
        </Card>
      )) : (
        <Card theme={theme}>
          <BodyText theme={theme}>{planner.topics.length ? 'No revisions are due today. Keep going!' : 'Add a topic to start your revision plan.'}</BodyText>
        </Card>
      )}

      {nextRows.length ? (
        <Card theme={theme}>
          <View style={styles.sectionHeader}>
            <Heading theme={theme}>Coming up</Heading>
            <MutedText theme={theme}>{nextRows.length} next</MutedText>
          </View>
          {nextRows.map(row => (
            <View key={`${row.topicId}-${row.revisionIndex}`} style={[styles.nextRow, {borderColor: theme.line}]}>
              <View style={{flex: 1}}>
                <BodyText theme={theme} style={{fontWeight: '700'}}>{row.topicName}</BodyText>
                <MutedText theme={theme}>Day {row.day}</MutedText>
              </View>
              <MutedText theme={theme}>{row.date}</MutedText>
            </View>
          ))}
        </Card>
      ) : null}

      <Card theme={theme}>
        <View style={styles.sectionHeader}>
          <View>
            <Heading theme={theme}>Study timer</Heading>
            <MutedText theme={theme}>25-minute Pomodoro session</MutedText>
          </View>
          <BodyText theme={theme} style={styles.timer}>{timerText}</BodyText>
        </View>
        <View style={styles.actions}>
          <Button theme={theme} compact label={running ? 'Pause' : 'Start'} onPress={() => setRunning(value => !value)} />
          <Button theme={theme} kind="secondary" compact label="Reset" onPress={() => {setRunning(false); setSecondsLeft(25 * 60);}} />
        </View>
      </Card>

      <Card theme={theme}>
        <Heading theme={theme}>Study progress</Heading>
        <ProgressBar theme={theme} percent={percent} />
        <MutedText theme={theme}>{completed} of {total} scheduled revisions completed</MutedText>
        <Button theme={theme} kind="secondary" label="Add or update a topic" onPress={() => onNavigate('Topics')} />
      </Card>
    </Page>
  );
}

function Stat({theme, value, label}: {theme: Theme; value: string; label: string}) {
  return (
    <Card theme={theme} style={styles.stat}>
      <BodyText theme={theme} style={[styles.statValue, {color: theme.accent}]}>{value}</BodyText>
      <MutedText theme={theme}>{label}</MutedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  welcome: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  welcomeCopy: {gap: 3},
  liveDot: {width: 10, height: 10, borderRadius: 5},
  statGrid: {flexDirection: 'row', gap: 10},
  stat: {flex: 1, padding: 12, alignItems: 'center', minHeight: 80, justifyContent: 'center'},
  statValue: {fontSize: 23, fontWeight: '900'},
  sectionHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  topicName: {fontWeight: '800', fontSize: 16},
  actions: {flexDirection: 'row', flexWrap: 'wrap', gap: 9},
  nextRow: {flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8},
  timer: {fontSize: 30, fontWeight: '900', color: '#156E81'},
});
